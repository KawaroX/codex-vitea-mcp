import type { ListToolsRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Db, MongoClient } from "mongodb";

/**
 * 处理列出工具请求
 */
export async function handleListToolsRequest({
  request,
  client,
  db,
  isReadOnlyMode,
  useMemory = false,
}: {
  request: ListToolsRequest;
  client: MongoClient;
  db: Db;
  isReadOnlyMode: boolean;
  useMemory?: boolean;
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
      description: "估算从一个地点到另一个地点的出行时间",
      inputSchema: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "出发地名称或ID",
          },
          destination: {
            type: "string",
            description: "目的地名称或ID",
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
      }
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
      } as any
    );
  }

  // 如果启用Memory系统，添加Memory相关工具
  if (useMemory) {
    // 使用类型断言处理 memory_status 工具
    viteaTools.push({
      name: "memory_status",
      description: "获取Memory系统状态和统计信息",
      inputSchema: {
        type: "object",
        properties: {
          detailed: {
            type: "boolean",
            description: "是否返回详细信息",
            default: false,
          },
        },
        required: [],
      } as any, // 使用类型断言
    });

    // 使用类型断言处理 memory_maintenance 工具
    viteaTools.push({
      name: "memory_maintenance",
      description: "管理Memory系统",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "维护操作",
            enum: ["cleanup_expired", "cleanup_old", "verify", "invalidate"],
          },
          memoryId: {
            type: "string",
            description: "Memory ID（用于verify和invalidate操作）",
          },
          confidenceThreshold: {
            type: "number",
            description: "置信度阈值（用于cleanup_old操作）",
            default: 0.5,
          },
          ageInDays: {
            type: "number",
            description: "天数阈值（用于cleanup_old操作）",
            default: 30,
          },
        },
        required: ["action"],
      } as any, // 使用类型断言
    });
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
