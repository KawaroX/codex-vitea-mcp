import type { ListToolsRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

// --- 将辅助 Schema 定义移到模块顶层 ---
const objectIdOrStringSchema = {
  type: ["string", "object"], // ObjectId can be represented as string in JSON
  description: "MongoDB ObjectId or its string representation.",
  // pattern: "^[0-9a-fA-F]{24}$" // Optional: if client strictly sends string ObjectId
};

const entityReferenceSchema = {
  type: "object",
  properties: {
    id: objectIdOrStringSchema,
    type: {
      type: "string",
      description: "实体类型 (e.g., 'contact', 'item', 'task')",
    },
    name: { type: "string", description: "实体名称 (可选)" },
    role: { type: "string", description: "实体在此记忆中的角色 (可选)" },
  },
  required: ["id", "type"],
};

const memoryPatternSchema = {
  type: "object",
  description: "用于检索记忆的结构化模式。",
  properties: {
    type: {
      type: "string",
      description: "模式类型 (e.g., 'user_query', 'tool_trigger')",
    },
    intent: {
      type: "string",
      description: "模式意图 (e.g., 'find_item_location')",
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "关键词列表",
    },
    entitiesInvolved: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "实体类型" },
          identifier: {
            type: "string",
            description: "实体标识符 (如名称关键词)",
          },
          attributes: { type: "object", description: "实体属性" },
          role: { type: "string", description: "实体在此模式中的角色" },
        },
        required: ["type"],
      },
      description: "模式中涉及的关键概念性实体",
    },
    structure: { type: "object", description: "自定义的复杂模式结构" },
  },
  required: ["type"],
};

// --- 新增 PlanningTool 相关的辅助 Schema ---
const schedulingConstraintsSchema = {
  type: "object",
  description: "任务调度约束条件 (可选)。",
  properties: {
    notBefore: {
      type: "string",
      format: "date-time",
      description: "任务最早可以开始的时间 (可选)。",
    },
    mustFinishBy: {
      type: "string",
      format: "date-time",
      description: "任务最晚必须完成的时间 (可选)。",
    },
    preferredTimeOfDay: {
      type: "string",
      enum: ["morning", "afternoon", "evening", "any"],
      description: "偏好执行时间段 (可选)。也允许自定义字符串。",
    },
    preferredDaysOfWeek: {
      type: "array",
      items: { type: "integer", minimum: 0, maximum: 6 },
      description: "偏好执行的星期几 (0=周日, ..., 6=周六, 可选)。",
    },
    requiredLocationId: {
      ...objectIdOrStringSchema,
      description: "必须在特定地点完成的地点ID (可选)。",
    },
    minEnergyLevel: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "所需的最低精力水平 (可选)。",
    },
    matchUserEnergyCycle: {
      type: "boolean",
      description: "是否尝试匹配用户的精力周期 (可选, 默认false)。",
    },
    allowSplitting: {
      type: "boolean",
      description: "是否允许将任务拆分到多个时间段执行 (可选, 默认false)。",
    },
    preferredBlockDurationHours: {
      type: "number",
      minimum: 0.25,
      description: "如果允许拆分，偏好的工作块时长（小时） (可选)。",
    },
  },
  additionalProperties: false,
};

const simplifiedScheduledEventSchema = {
  // 用于 CurrentUserContext.upcomingEvents
  type: "object",
  properties: {
    title: { type: "string" },
    startTime: { type: "string", format: "date-time" },
    endTime: { type: "string", format: "date-time" },
    eventType: { type: "string" },
  },
  required: ["title", "startTime", "endTime", "eventType"],
};

const currentUserContextSchema = {
  type: "object",
  description: "调用 suggestNextTask 时提供的当前用户/系统上下文。",
  properties: {
    currentTime: {
      type: "string",
      format: "date-time",
      description: "当前的UTC时间。",
    },
    currentLocationId: {
      ...objectIdOrStringSchema,
      description: "用户当前所在位置的ID (可选)。",
    },
    currentEnergyLevel: {
      type: ["string", "number"], // 可以是 'low', 'medium', 'high' 或数字评分
      description: "用户当前的精力评估值 (可选)。",
    },
    recentTaskPerformance: {
      type: "object",
      additionalProperties: true,
      description: "最近任务完成情况的洞察 (来自Reminisce, 可选)。",
    },
    upcomingEvents: {
      type: "array",
      items: simplifiedScheduledEventSchema,
      description: "接下来几个小时内的日程安排 (可选)。",
    },
    userFocus: {
      type: "string",
      description: "用户当前声明的关注点或项目 (可选)。",
    },
    dailyHealthSummary: {
      type: "object",
      properties: {
        sleepHours: { type: "number", minimum: 0 },
        stressLevel: { type: "string", enum: ["low", "medium", "high"] },
        overallFeeling: { type: "string" },
      },
      description: "用户当天的整体健康/状态摘要 (可选)。",
    },
  },
  required: ["currentTime"],
};

/**
 * 处理列出工具请求
 */
export async function handleListToolsRequest({
  request,
  client,
  db,
  isReadOnlyMode,
}: {
  request: ListToolsRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
}) {
  // 定义ViteaOS特有工具
  const viteaTools = [
    {
      name: "find_item",
      description: "查找物品位置和状态",
      inputSchema: {
        type: "object",
        properties: {
          itemName: {
            type: "string",
            description: "要查找的物品名称或关键词",
          },
          exactMatch: {
            type: "boolean",
            description: "是否精确匹配名称（默认为false，进行模糊匹配）",
            default: false,
          },
        },
        required: ["itemName"],
      },
    },
    {
      name: "estimate_time",
      description:
        "估算从一个地点到另一个地点的出行时间，结合个人行走速度和高德地图数据",
      inputSchema: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "起点名称或ID",
          },
          destination: {
            type: "string",
            description: "终点名称或ID",
          },
          contactName: {
            type: "string",
            description:
              "联系人名称（如果目的地与联系人相关，如联系人的学校、家、公司等）",
          },
          transportation: {
            type: "string",
            description:
              "交通方式: walking(步行), bicycling(骑行), driving(驾车), transit(公交)",
            enum: ["walking", "bicycling", "driving", "transit"],
            default: "walking",
          },
        },
        required: ["origin", "destination"],
      },
    },
    {
      name: "query_item",
      description: "查询物品信息",
      inputSchema: {
        type: "object",
        properties: {
          itemId: {
            type: "string",
            description: "物品ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          containerId: {
            type: "string",
            description: "容器ID，用于查询容器内物品",
          },
          containerItems: {
            type: "boolean",
            description: "是否查询容器内物品，需要与containerId一起使用",
            default: false,
          },
        },
        oneOf: [
          { required: ["itemId"] },
          { required: ["search"] },
          { required: ["containerId", "containerItems"] },
        ],
      },
    },
    {
      name: "query_location",
      description: "查询位置信息",
      inputSchema: {
        type: "object",
        properties: {
          locationId: {
            type: "string",
            description: "位置ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          hierarchyFor: {
            type: "string",
            description: "查询位置层次结构的位置ID",
          },
          childrenOf: {
            type: "string",
            description: "父位置ID，用于查询子位置",
          },
        },
        oneOf: [
          { required: ["locationId"] },
          { required: ["search"] },
          { required: ["hierarchyFor"] },
          { required: ["childrenOf"] },
        ],
      },
    },
    {
      name: "query_contact",
      description: "查询联系人信息",
      inputSchema: {
        type: "object",
        properties: {
          contactId: {
            type: "string",
            description: "联系人ID",
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
          relationship: {
            type: "string",
            description: "关系类型",
          },
          tag: {
            type: "string",
            description: "联系人标签",
          },
          school: {
            type: "string",
            description: "学校或单位",
          },
          hukou: {
            type: "string",
            description: "户籍地",
          },
        },
        oneOf: [
          { required: ["contactId"] },
          { required: ["search"] },
          { required: ["relationship"] },
          { required: ["tag"] },
          { required: ["school"] },
          { required: ["hukou"] },
        ],
      },
    },
    {
      name: "query_biodata",
      description: "查询生物数据",
      inputSchema: {
        type: "object",
        properties: {
          recordId: {
            type: "string",
            description: "记录ID",
          },
          measurementType: {
            type: "string",
            description: "测量类型，如'走路速度'、'体重'等",
          },
          history: {
            type: "boolean",
            description: "是否查询历史记录，需要与measurementType一起使用",
            default: false,
          },
          stats: {
            type: "boolean",
            description: "是否查询统计信息，需要与measurementType一起使用",
            default: false,
          },
          limit: {
            type: "integer",
            description: "限制返回记录数量",
            default: 10,
          },
          measurementTypes: {
            type: "boolean",
            description: "是否查询所有测量类型",
            default: false,
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
        },
        oneOf: [
          { required: ["recordId"] },
          { required: ["measurementType", "history"] },
          { required: ["measurementType", "stats"] },
          { required: ["measurementTypes"] },
          { required: ["search"] },
        ],
      },
    },
    {
      name: "query_task",
      description: "查询任务信息",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "任务ID",
          },
          tag: {
            type: "string",
            description: "任务标签",
          },
          taskType: {
            type: "string",
            description: "任务类型",
          },
          upcoming: {
            type: "boolean",
            description: "是否查询即将到期的任务",
            default: false,
          },
          days: {
            type: "integer",
            description: "天数阈值，用于即将到期任务查询",
            default: 7,
          },
          overdue: {
            type: "boolean",
            description: "是否查询逾期任务",
            default: false,
          },
          allTasks: {
            type: "boolean",
            description: "是否查询所有任务",
            default: false,
          },
          query: {
            type: "object",
            description: "自定义查询条件",
          },
          limit: {
            type: "integer",
            description: "限制返回任务数量",
            default: 20,
          },
        },
        oneOf: [
          { required: ["taskId"] },
          { required: ["tag"] },
          { required: ["taskType"] },
          { required: ["upcoming"] },
          { required: ["overdue"] },
          { required: ["allTasks"] },
        ],
      },
    },
    // 搜索笔记工具
    {
      name: "search_notes",
      description: "搜索带有特定标签的笔记或实体的笔记",
      inputSchema: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            description: "标签",
          },
          entityType: {
            type: "string",
            description: "实体类型(item, location, contact, task, biodata)",
          },
          entityId: {
            type: "string",
            description: "实体ID",
          },
          entityName: {
            type: "string",
            description: "实体名称（如果未提供ID）",
          },
          limit: {
            type: "integer",
            description: "限制返回笔记数量",
            default: 20,
          },
        },
        oneOf: [
          { required: ["tag"] },
          {
            allOf: [
              { required: ["entityType"] },
              {
                oneOf: [
                  { required: ["entityId"] },
                  { required: ["entityName"] },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      name: "reminisce_learn",
      description: "学习新的信息并将其存储为记忆单元。",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            ...memoryPatternSchema,
            description: "记忆的检索模式，用于未来回忆。",
          },
          result: {
            type: "object",
            description: "记忆的核心内容或学习到的结果 (可以是任何JSON结构)。",
          }, // 'any' type in JSON schema
          summary: {
            type: "string",
            description: "对结果的简短文本摘要 (可选)。",
          },
          entities: {
            type: "array",
            items: entityReferenceSchema,
            description: "与此记忆相关的核心实体列表 (可选)。",
          },
          relationships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceEntityId: objectIdOrStringSchema,
                relationshipType: {
                  type: "string",
                  description: "关系类型 (e.g., 'knows', 'works_for')",
                },
                targetEntityId: objectIdOrStringSchema,
                direction: {
                  type: "string",
                  enum: ["to", "from", "bi"],
                  description: "关系方向 (可选)",
                },
                context: {
                  type: "string",
                  description: "关系的附加上下文 (可选)",
                },
              },
              required: [
                "sourceEntityId",
                "relationshipType",
                "targetEntityId",
              ],
            },
            description: "记忆中直接表述的实体间关系 (可选)。",
          },
          context: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              conversationId: { type: "string" },
              userId: { type: "string" },
              sourceTool: { type: "string", description: "触发学习的工具名称" },
              sourceEvent: {
                type: "string",
                description: "触发学习的事件类型",
              },
              userInput: { type: "string", description: "相关的原始用户输入" },
              timestamp: {
                type: "string",
                format: "date-time",
                description: "上下文发生的时间",
              },
              locationContext: objectIdOrStringSchema,
            },
            description: "产生记忆时的上下文信息 (可选)。",
          },
          importance: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "记忆的重要性 (0-1, 可选, 默认0.5)。",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "记忆的可信度 (0-1, 可选, 默认0.8)。",
          },
          tier: {
            type: "string",
            enum: ["short", "medium", "long"],
            description:
              "记忆的初始层级 (可选, 默认'medium')。也允许其他自定义字符串。",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "记忆的标签 (可选)。",
          },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "记忆的过期时间 (可选)。",
          },
          relatedMemoryIds: {
            type: "array",
            items: objectIdOrStringSchema,
            description: "手动指定的关联记忆ID列表 (可选)。",
          },
        },
        required: ["pattern", "result"],
      },
    },
    {
      name: "reminisce_recall",
      description: "根据提供的参数回忆相关的记忆单元。",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            ...memoryPatternSchema,
            description: "主要的检索模式 (可选)。",
          },
          textQuery: {
            type: "string",
            description:
              "自然语言查询文本，用于更灵活的模式生成或关键词提取 (可选)。",
          },
          entities: {
            type: "array",
            items: entityReferenceSchema,
            description: "查询中明确涉及的实体列表 (可选)。",
          },
          context: {
            // 与 learn 中的 context schema 类似
            type: "object",
            properties: {
              context: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  conversationId: { type: "string" },
                  userId: { type: "string" },
                  sourceTool: {
                    type: "string",
                    description: "触发学习的工具名称",
                  },
                  sourceEvent: {
                    type: "string",
                    description: "触发学习的事件类型",
                  },
                  userInput: {
                    type: "string",
                    description: "相关的原始用户输入",
                  },
                  timestamp: {
                    type: "string",
                    format: "date-time",
                    description: "上下文发生的时间",
                  },
                  locationContext: objectIdOrStringSchema,
                },
                description: "产生记忆时的上下文信息 (可选)。",
              },
            },
            additionalProperties: true,
            description: "当前查询的上下文信息 (可选)。",
          },
          options: {
            // MongoDB FindOptions 的简化版
            type: "object",
            properties: {
              limit: { type: "integer", minimum: 1 },
              sort: { type: "object" }, // 例如: { importance: -1 }
            },
            description: "传递给数据库查询的选项 (可选)。",
          },
          minConfidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "回忆结果的最低可信度要求 (可选)。",
          },
          requiredTiers: {
            type: "array",
            items: { type: "string" }, // e.g., ["long", "core_fact"]
            description: "只在特定层级的记忆中查找 (可选)。",
          },
        },
        // 至少需要一个查询参数
        anyOf: [
          { required: ["pattern"] },
          { required: ["textQuery"] },
          { required: ["entities"] },
        ],
      },
    },
    {
      name: "reminisce_manage_memory",
      description: "管理特定记忆单元的元数据。",
      inputSchema: {
        type: "object",
        properties: {
          memoryId: {
            ...objectIdOrStringSchema,
            description: "要管理的记忆单元的ID。",
          },
          action: {
            type: "string",
            enum: [
              "update_importance",
              "update_confidence",
              "change_tier",
              "add_tag",
              "remove_tag",
              "archive",
              "unarchive",
            ],
            description: "要执行的管理操作。",
          },
          value: {
            // value 的类型取决于 action，这里使用 anyOf 来尝试覆盖
            // 对于更严格的 schema，可以为每种 action 定义不同的输入结构，然后使用 oneOf
            type: ["string", "number", "boolean", "object", "array"],
            description:
              "操作所需的值 (例如，新的重要性评分，要添加/移除的标签，新的层级)。",
          },
        },
        required: ["memoryId", "action"],
      },
    },
    // --- 新增 Planning/Scheduling 工具 Schema ---
    {
      name: "plan_propose_task_schedule",
      description: "为指定任务提议一个或多个执行时间段。",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            ...objectIdOrStringSchema,
            description: "要调度的任务ID。",
          },
          constraints: { ...schedulingConstraintsSchema }, // 使用定义的辅助schema
        },
        required: ["taskId"],
      },
    },
    {
      name: "plan_suggest_next_task",
      description: "根据当前上下文，建议用户接下来应该执行的任务。",
      inputSchema: {
        type: "object",
        properties: {
          context: { ...currentUserContextSchema }, // 使用定义的辅助schema
        },
        required: ["context"],
      },
    },
    {
      name: "plan_generate_daily_agenda",
      description: "为指定日期生成每日议程。",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            format: "date-time",
            description: "要生成议程的日期 (ISO 8601格式)。",
          },
          userId: {
            type: "string",
            description: "用户ID (可选，用于多用户系统)。",
          },
        },
        required: ["date"],
      },
    },
    {
      name: "plan_reschedule_event",
      description: "重新调度一个已安排的事件或与任务关联的事件。",
      inputSchema: {
        type: "object",
        properties: {
          eventOrTaskId: {
            ...objectIdOrStringSchema,
            description: "日程事件ID或任务ID。",
          },
          newTime: {
            type: "object",
            properties: {
              startTime: {
                type: "string",
                format: "date-time",
                description: "新的开始时间。",
              },
              endTime: {
                type: "string",
                format: "date-time",
                description: "新的结束时间。",
              },
            },
            required: ["startTime", "endTime"],
            description: "新的时间安排 (可选)。",
          },
          reason: { type: "string", description: "重排原因 (可选)。" },
        },
        required: ["eventOrTaskId"],
      },
    },
    {
      name: "plan_find_available_time_slots",
      description: "查找指定时长和日期范围内的可用时间段。",
      inputSchema: {
        type: "object",
        properties: {
          durationMinutes: {
            type: "integer",
            minimum: 1,
            description: "所需时间段的分钟数。",
          },
          dateRange: {
            type: "object",
            properties: {
              start: {
                type: "string",
                format: "date-time",
                description: "查找范围的开始时间。",
              },
              end: {
                type: "string",
                format: "date-time",
                description: "查找范围的结束时间。",
              },
            },
            required: ["start", "end"],
            description: "查找的日期范围 (可选, 默认未来7天)。",
          },
          constraints: {
            type: "object",
            properties: {
              preferredTimeOfDay: {
                type: "string",
                enum: ["morning", "afternoon", "evening", "any"],
              },
              preferredDaysOfWeek: {
                type: "array",
                items: { type: "integer", minimum: 0, maximum: 6 },
              },
              workingHours: {
                type: "object",
                properties: {
                  startHour: { type: "integer", minimum: 0, maximum: 23 },
                  endHour: { type: "integer", minimum: 0, maximum: 23 },
                  daysOfWeek: {
                    type: "array",
                    items: { type: "integer", minimum: 0, maximum: 6 },
                  },
                },
                required: ["startHour", "endHour"],
              },
              minGapMinutes: {
                type: "integer",
                minimum: 0,
                description: "事件之间的最小间隙分钟数 (可选)。",
              },
            },
            description: "额外的查找约束 (可选)。",
          },
        },
        required: ["durationMinutes"],
      },
    },
    {
      name: "plan_learn_scheduling_preference",
      description: "学习用户的日程安排偏好，并存储到记忆系统。",
      inputSchema: {
        type: "object",
        properties: {
          userId: {
            type: "string",
            description: "用户ID (可选，用于多用户系统)。",
          },
          preferenceType: {
            type: "string",
            description:
              "偏好类型 (e.g., 'timing', 'task_grouping', 'energy_matching')。",
          },
          description: {
            type: "string",
            description: "用户对偏好的自然语言描述。",
          },
          pattern: {
            type: "object",
            additionalProperties: true,
            description: "用于Reminisce的更结构化的模式 (可选)。",
          },
          details: {
            type: "object",
            additionalProperties: true,
            description: "关于偏好的具体细节 (可选)。",
          },
          importance: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "用户定义的偏好重要性 (0-1, 可选)。",
          },
        },
        required: ["preferenceType", "description"],
      },
    },
    {
      name: "plan_learn_scheduling_preference",
      description: "学习用户的日程安排偏好，并存储到记忆系统。",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string", description: "用户ID (可选)。" },
          preferenceType: {
            type: "string",
            description: "偏好类型 (e.g., 'timing', 'task_grouping')。",
          },
          description: {
            type: "string",
            description: "用户对偏好的自然语言描述。",
          },
          pattern: {
            ...memoryPatternSchema,
            description: "用于Reminisce的更结构化的模式 (可选)。",
          }, // Use spread
          details: {
            type: "object",
            additionalProperties: true,
            description: "关于偏好的具体细节 (可选)。",
          },
          importance: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "用户定义的偏好重要性 (0-1, 可选)。",
          },
        },
        required: ["preferenceType", "description"],
      },
    },
    // --- 新增：确认日程安排的工具 ---
    {
      name: "plan_confirm_schedule_slot",
      description: "确认一个提议的时间段并将相关任务安排到日程中。",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            ...objectIdOrStringSchema,
            description: "要安排的任务ID。",
          },
          startTime: {
            type: "string",
            format: "date-time",
            description: "选定的开始时间 (ISO格式)。",
          },
          endTime: {
            type: "string",
            format: "date-time",
            description: "选定的结束时间 (ISO格式)。",
          },
          title: {
            type: "string",
            description: "日程事件的标题 (可选，默认为任务名称)。",
          },
          description: {
            type: "string",
            description: "日程事件的描述 (可选，默认为任务描述)。",
          },
          eventType: {
            type: "string",
            description: "事件类型 (可选，默认为 'task')。",
          },
          status: {
            type: "string",
            enum: ["confirmed", "tentative"],
            description: "事件状态 (可选，默认为 'confirmed')。",
          },
          userId: {
            type: "string",
            description: "用户ID (可选，用于Reminisce上下文)。",
          },
          schedulingReasoning: {
            type: "array",
            items: { type: "string" },
            description: "做出此调度决策的理由 (可选，用于学习)。",
          },
        },
        required: ["taskId", "startTime", "endTime"],
      },
    },
  ];

  if (!isReadOnlyMode) {
    viteaTools.push(
      // 添加物品创建工具
      {
        name: "create_item",
        description: "创建新物品",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "物品名称",
            },
            category: {
              type: "string",
              description: "物品类别（可选）",
            },
            status: {
              type: "string",
              description: '物品状态（可选，默认为"在用"）',
            },
            quantity: {
              type: "integer",
              description: "物品数量（可选，默认为1）",
            },
            isContainer: {
              type: "boolean",
              description: "是否为容器（可选，默认为false）",
            },
            locationId: {
              type: "string",
              description: "位置ID",
            },
            locationName: {
              type: "string",
              description: "位置名称（如果未提供ID）",
            },
            containerId: {
              type: "string",
              description: "容器ID",
            },
            containerName: {
              type: "string",
              description: "容器名称（如果未提供ID）",
            },
            note: {
              type: "string",
              description: "创建备注（可选）",
            },
          },
          required: ["name"],
        },
      } as any,

      // 添加物品删除工具
      {
        name: "delete_item",
        description: "删除物品",
        inputSchema: {
          type: "object",
          properties: {
            itemId: {
              type: "string",
              description: "物品ID",
            },
            itemName: {
              type: "string",
              description: "物品名称（如果未提供ID）",
            },
            isSoftDelete: {
              type: "boolean",
              description:
                "是否软删除（标记为已删除而不是真正删除，可选，默认为true）",
              default: true,
            },
          },
          oneOf: [{ required: ["itemId"] }, { required: ["itemName"] }],
        },
      } as any,
      {
        name: "update_item",
        description: "更新物品位置或状态",
        inputSchema: {
          type: "object",
          properties: {
            itemId: {
              type: "string",
              description: "物品ID",
            },
            search: {
              type: "string",
              description: "搜索关键词",
            },
            containerId: {
              type: "string",
              description: "容器ID，用于查询容器内物品",
            },
            containerItems: {
              type: "boolean",
              description: "是否查询容器内物品，需要与containerId一起使用",
              default: false,
            },
          },
          oneOf: [
            { required: ["itemId"] },
            { required: ["search"] },
            { required: ["containerId", "containerItems"] },
          ],
        },
      },
      {
        name: "update_item_info",
        description: "更新物品基本信息",
        inputSchema: {
          type: "object",
          properties: {
            itemId: {
              type: "string",
              description: "物品ID",
            },
            itemName: {
              type: "string",
              description: "物品名称（如果未提供ID）",
            },
            newName: {
              type: "string",
              description: "新物品名称",
            },
            newCategory: {
              type: "string",
              description: "新物品类别",
            },
            newStatus: {
              type: "string",
              description: "新物品状态",
            },
            newQuantity: {
              type: "integer",
              description: "新物品数量",
            },
            note: {
              type: "string",
              description: "更新备注（可选）",
            },
          },
          oneOf: [{ required: ["itemId"] }, { required: ["itemName"] }],
          anyOf: [
            { required: ["newName"] },
            { required: ["newCategory"] },
            { required: ["newStatus"] },
            { required: ["newQuantity"] },
          ],
        },
      } as any,
      // 在viteaTools数组中添加联系人管理工具
      {
        name: "create_contact",
        description: "创建新联系人",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "联系人名称",
            },
            phone: {
              type: "string",
              description: "电话号码",
            },
            email: {
              type: "string",
              description: "电子邮件",
            },
            birthDate: {
              type: "string",
              description: "出生日期（格式：YYYY-MM-DD）",
            },
            hukou: {
              type: "string",
              description: "户籍所在地",
            },
            school: {
              type: "string",
              description: "学校或单位",
            },
            residence: {
              type: "string",
              description: "居住地",
            },
            detailedResidence: {
              type: "string",
              description: "详细居住地址",
            },
            workAddress: {
              type: "string",
              description: "工作地址",
            },
            socialMedia: {
              type: "string",
              description: "社交媒体账号",
            },
            avatar: {
              type: "string",
              description: "头像URL",
            },
            hobbies: {
              type: "string",
              description: "兴趣爱好",
            },
            relationship: {
              type: "string",
              description: "与联系人的关系类型",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "标签数组",
            },
            note: {
              type: "string",
              description: "创建备注（可选）",
            },
          },
          required: ["name"],
        },
      } as any,
      {
        name: "delete_contact",
        description: "删除联系人",
        inputSchema: {
          type: "object",
          properties: {
            contactId: {
              type: "string",
              description: "联系人ID",
            },
            contactName: {
              type: "string",
              description: "联系人名称（如果未提供ID）",
            },
          },
          oneOf: [{ required: ["contactId"] }, { required: ["contactName"] }],
        },
      } as any,
      {
        name: "update_contact_info",
        description: "更新联系人信息",
        inputSchema: {
          type: "object",
          properties: {
            contactId: {
              type: "string",
              description: "联系人ID",
            },
            contactName: {
              type: "string",
              description: "联系人名称（如果未提供ID）",
            },
            newName: {
              type: "string",
              description: "新联系人名称",
            },
            newPhone: {
              type: "string",
              description: "新电话号码",
            },
            newEmail: {
              type: "string",
              description: "新电子邮件",
            },
            newBirthDate: {
              type: "string",
              description: "新出生日期（格式：YYYY-MM-DD）",
            },
            newHukou: {
              type: "string",
              description: "新户籍所在地",
            },
            newSchool: {
              type: "string",
              description: "新学校或单位",
            },
            newResidence: {
              type: "string",
              description: "新居住地",
            },
            newDetailedResidence: {
              type: "string",
              description: "新详细居住地址",
            },
            newWorkAddress: {
              type: "string",
              description: "新工作地址",
            },
            newSocialMedia: {
              type: "string",
              description: "新社交媒体账号",
            },
            newAvatar: {
              type: "string",
              description: "新头像URL",
            },
            newHobbies: {
              type: "string",
              description: "新兴趣爱好",
            },
            newRelationship: {
              type: "string",
              description: "新关系类型",
            },
            newTags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "新标签数组",
            },
            note: {
              type: "string",
              description: "更新备注（可选）",
            },
          },
          oneOf: [{ required: ["contactId"] }, { required: ["contactName"] }],
          anyOf: [
            { required: ["newName"] },
            { required: ["newPhone"] },
            { required: ["newEmail"] },
            { required: ["newBirthDate"] },
            { required: ["newHukou"] },
            { required: ["newSchool"] },
            { required: ["newResidence"] },
            { required: ["newDetailedResidence"] },
            { required: ["newWorkAddress"] },
            { required: ["newSocialMedia"] },
            { required: ["newAvatar"] },
            { required: ["newHobbies"] },
            { required: ["newRelationship"] },
            { required: ["newTags"] },
          ],
        },
      } as any,
      {
        name: "create_location",
        description: "创建新位置",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "位置名称",
            },
            type: {
              type: "string",
              description: "位置类型",
            },
            address: {
              type: "string",
              description: "地址",
            },
            openingHours: {
              type: "string",
              description: "开放时间",
            },
            phone: {
              type: "string",
              description: "联系电话",
            },
            parentLocationId: {
              type: "string",
              description: "父位置ID",
            },
            parentLocationName: {
              type: "string",
              description: "父位置名称（如果未提供ID）",
            },
            coordinates: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "纬度",
                },
                longitude: {
                  type: "number",
                  description: "经度",
                },
              },
              required: ["latitude", "longitude"],
              description: "地理坐标",
            },
            notes: {
              type: "string",
              description: "备注",
            },
          },
          required: ["name"],
        },
      } as any,
      {
        name: "update_location_info",
        description: "更新位置信息",
        inputSchema: {
          type: "object",
          properties: {
            locationId: {
              type: "string",
              description: "位置ID",
            },
            locationName: {
              type: "string",
              description: "位置名称（如果未提供ID）",
            },
            newName: {
              type: "string",
              description: "新位置名称",
            },
            newType: {
              type: "string",
              description: "新位置类型",
            },
            newAddress: {
              type: "string",
              description: "新地址",
            },
            newOpeningHours: {
              type: "string",
              description: "新开放时间",
            },
            newPhone: {
              type: "string",
              description: "新联系电话",
            },
            newParentLocationId: {
              type: "string",
              description: "新父位置ID",
            },
            newParentLocationName: {
              type: "string",
              description: "新父位置名称（如果未提供ID）",
            },
            newCoordinates: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "纬度",
                },
                longitude: {
                  type: "number",
                  description: "经度",
                },
              },
              required: ["latitude", "longitude"],
              description: "新地理坐标",
            },
            newNotes: {
              type: "string",
              description: "新备注",
            },
          },
          oneOf: [{ required: ["locationId"] }, { required: ["locationName"] }],
          anyOf: [
            { required: ["newName"] },
            { required: ["newType"] },
            { required: ["newAddress"] },
            { required: ["newOpeningHours"] },
            { required: ["newPhone"] },
            { required: ["newParentLocationId"] },
            { required: ["newParentLocationName"] },
            { required: ["newCoordinates"] },
            { required: ["newNotes"] },
          ],
        },
      } as any,
      {
        name: "delete_location",
        description: "删除位置",
        inputSchema: {
          type: "object",
          properties: {
            locationId: {
              type: "string",
              description: "位置ID",
            },
            locationName: {
              type: "string",
              description: "位置名称（如果未提供ID）",
            },
            force: {
              type: "boolean",
              description: "是否强制删除（即使有子位置或被物品引用）",
              default: false,
            },
          },
          oneOf: [{ required: ["locationId"] }, { required: ["locationName"] }],
        },
      } as any,
      // 在viteaTools数组中添加生物数据管理工具
      {
        name: "create_biodata",
        description: "创建新的生物数据测量记录",
        inputSchema: {
          type: "object",
          properties: {
            measurementType: {
              type: "string",
              description: "测量类型，如'走路速度'、'体重'等",
            },
            value: {
              type: "number",
              description: "测量值",
            },
            unit: {
              type: "string",
              description: "单位，如'米/分钟'、'千克'等",
            },
            recordName: {
              type: "string",
              description: "记录名称（可选，默认为'测量类型-当前日期'）",
            },
            context: {
              type: "string",
              description: "测量情境或说明",
            },
            notes: {
              type: "string",
              description: "备注",
            },
            measuredAt: {
              type: "string",
              description:
                "测量时间（格式：YYYY-MM-DDTHH:mm:ss，默认为当前时间）",
            },
          },
          required: ["measurementType", "value"],
        },
      } as any,
      {
        name: "delete_biodata",
        description: "删除生物数据测量记录",
        inputSchema: {
          type: "object",
          properties: {
            recordId: {
              type: "string",
              description: "记录ID",
            },
            measurementType: {
              type: "string",
              description: "测量类型",
            },
            recordName: {
              type: "string",
              description: "记录名称",
            },
          },
          oneOf: [
            { required: ["recordId"] },
            { required: ["measurementType", "recordName"] },
          ],
        },
      } as any
    );
    viteaTools.push(
      {
        name: "transfer_item",
        description: "转移物品到新的位置或容器",
        inputSchema: {
          type: "object",
          properties: {
            itemId: {
              type: "string",
              description: "物品ID",
            },
            itemName: {
              type: "string",
              description: "物品名称（如果未提供ID）",
            },
            targetLocationId: {
              type: "string",
              description: "目标位置ID",
            },
            targetLocationName: {
              type: "string",
              description: "目标位置名称（如果未提供ID）",
            },
            targetContainerId: {
              type: "string",
              description: "目标容器ID",
            },
            targetContainerName: {
              type: "string",
              description: "目标容器名称（如果未提供ID）",
            },
            note: {
              type: "string",
              description: "转移备注（可选）",
            },
            removeFromCurrentContainer: {
              type: "boolean",
              description: "是否从当前容器中移除物品（默认为true）",
              default: true,
            },
          },
          oneOf: [{ required: ["itemId"] }, { required: ["itemName"] }],
          anyOf: [
            { required: ["targetLocationId"] },
            { required: ["targetLocationName"] },
            { required: ["targetContainerId"] },
            { required: ["targetContainerName"] },
          ],
        },
      } as any,
      // 在 viteaTools 数组中添加
      {
        name: "update_task_status",
        description: "更新任务状态并记录状态变更历史",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "任务ID",
            },
            taskName: {
              type: "string",
              description: "任务名称（如果未提供ID）",
            },
            newStatus: {
              type: "string",
              description:
                "新状态（未开始、进行中、已完成、已取消、已暂停、待审核）",
            },
            comment: {
              type: "string",
              description: "状态变更备注（可选）",
            },
          },
          required: ["newStatus"],
          oneOf: [{ required: ["taskId"] }, { required: ["taskName"] }],
        },
      } as any,
      // 添加结构化笔记工具
      {
        name: "add_structured_note",
        description: "为任何实体添加带标签和关联的结构化笔记",
        inputSchema: {
          type: "object",
          properties: {
            entityType: {
              type: "string",
              description: "实体类型(item, location, contact, task, biodata)",
            },
            entityId: {
              type: "string",
              description: "实体ID",
            },
            entityName: {
              type: "string",
              description: "实体名称（如果未提供ID）",
            },
            content: {
              type: "string",
              description: "笔记内容",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "标签数组（可选）",
            },
            relatedEntities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description:
                      "相关实体类型(item, location, contact, task, biodata)",
                  },
                  id: {
                    type: "string",
                    description: "相关实体ID",
                  },
                  name: {
                    type: "string",
                    description: "相关实体名称（如果未提供ID）",
                  },
                },
                required: ["type"],
              },
              description: "相关实体数组（可选）",
            },
          },
          required: ["entityType", "content"],
          oneOf: [{ required: ["entityId"] }, { required: ["entityName"] }],
        },
      } as any,
      {
        name: "create_task",
        description: "创建新任务",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "任务名称",
            },
            status: {
              type: "string",
              description: "任务状态（未开始、进行中、已完成、已取消等）",
              default: "未开始",
            },
            dueDate: {
              type: "string",
              description: "截止日期（格式：YYYY-MM-DD）",
            },
            priority: {
              type: "string",
              description: "优先级（高、中、低等）",
            },
            taskType: {
              type: "string",
              description: "任务类型",
            },
            description: {
              type: "string",
              description: "任务描述",
            },
            workloadLevel: {
              type: "string",
              description: "工作量级别",
            },
            assignee: {
              type: "string",
              description: "负责人",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "任务标签数组",
            },
            note: {
              type: "string",
              description: "创建备注（可选）",
            },
          },
          required: ["name"],
        },
      } as any,
      {
        name: "delete_task",
        description: "删除任务",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "任务ID",
            },
            taskName: {
              type: "string",
              description: "任务名称（如果未提供ID）",
            },
          },
          oneOf: [{ required: ["taskId"] }, { required: ["taskName"] }],
        },
      } as any,
      {
        name: "update_task_info",
        description: "更新任务信息（不包括状态更新）",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "任务ID",
            },
            taskName: {
              type: "string",
              description: "任务名称（如果未提供ID）",
            },
            newName: {
              type: "string",
              description: "新任务名称",
            },
            newDueDate: {
              type: "string",
              description: "新截止日期（格式：YYYY-MM-DD）",
            },
            newPriority: {
              type: "string",
              description: "新优先级",
            },
            newTaskType: {
              type: "string",
              description: "新任务类型",
            },
            newDescription: {
              type: "string",
              description: "新任务描述",
            },
            newWorkloadLevel: {
              type: "string",
              description: "新工作量级别",
            },
            newAssignee: {
              type: "string",
              description: "新负责人",
            },
            newTags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "新任务标签数组",
            },
            note: {
              type: "string",
              description: "更新备注（可选）",
            },
          },
          oneOf: [{ required: ["taskId"] }, { required: ["taskName"] }],
          anyOf: [
            { required: ["newName"] },
            { required: ["newDueDate"] },
            { required: ["newPriority"] },
            { required: ["newTaskType"] },
            { required: ["newDescription"] },
            { required: ["newWorkloadLevel"] },
            { required: ["newAssignee"] },
            { required: ["newTags"] },
          ],
        },
      } as any
    );
  }

  // 添加便捷工具
  viteaTools.push(
    {
      name: "get_latest_biodata",
      description: "获取最新的生物数据测量值",
      inputSchema: {
        type: "object",
        properties: {
          measurementType: {
            type: "string",
            description: "测量类型，如'走路速度'、'体重'等",
          },
          recordId: {
            type: "string",
            description: "记录ID",
          },
          history: {
            type: "boolean",
            description: "是否查询历史记录，需要与measurementType一起使用",
            default: false,
          },
          stats: {
            type: "boolean",
            description: "是否查询统计信息，需要与measurementType一起使用",
            default: false,
          },
          limit: {
            type: "integer",
            description: "限制返回记录数量",
            default: 1,
          },
          measurementTypes: {
            type: "boolean",
            description: "是否查询所有测量类型",
            default: false,
          },
          search: {
            type: "string",
            description: "搜索关键词",
          },
        },
        oneOf: [
          { required: ["recordId"] },
          { required: ["measurementType", "history"] },
          { required: ["measurementType", "stats"] },
          { required: ["measurementTypes"] },
          { required: ["search"] },
        ],
      },
    },
    {
      name: "get_pending_tasks",
      description: "获取待办任务列表",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "特定任务ID",
          },
          tag: {
            type: "string",
            description: "任务标签筛选",
          },
          taskType: {
            type: "string",
            description: "任务类型筛选",
          },
          upcoming: {
            type: "boolean",
            description: "是否只查询即将到期任务",
            default: false,
          },
          days: {
            type: "integer",
            description: "即将到期的天数阈值",
            default: 7,
          },
          overdue: {
            type: "boolean",
            description: "是否只查询逾期任务",
            default: false,
          },
          allTasks: {
            type: "boolean",
            description: "是否查询所有任务",
            default: false,
          },
          query: {
            type: "object",
            description: "自定义查询条件",
          },
          limit: {
            type: "integer",
            description: "限制返回任务数量",
            default: 10,
          },
        },
        oneOf: [
          { required: ["taskId"] },
          { required: ["tag"] },
          { required: ["taskType"] },
          { required: ["upcoming"] },
          { required: ["overdue"] },
          { required: ["allTasks"] },
        ],
      },
    }
  );

  return {
    tools: viteaTools,
  };
}
