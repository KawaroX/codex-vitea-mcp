import { ObjectId } from "mongodb";

// 同步字段接口(所有集合共享)
export interface SyncFields {
  notionId?: string; // Notion页面ID
  syncedToNotion: boolean; // 是否已同步到Notion
  lastSync: Date | null; // 最后同步时间
  modifiedSinceSync: boolean; // 同步后是否修改
}

// 基础文档接口
export interface BaseDocument extends SyncFields {
  _id: ObjectId; // MongoDB ID
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
  customFields?: Record<string, any>; // 自定义字段
}

export interface StructuredNote {
  timestamp: string;
  content: string;
  metadata?: {
    containerId?: ObjectId | string | null;
    locationId?: ObjectId | string | null;
    tags?: string[];
    // 允许任何其他字段
    [key: string]: any;
  };
}

// 物品接口
export interface Item extends BaseDocument {
  name: string; // 物品名称
  containerId?: ObjectId | string; // 容器ID
  locationId?: ObjectId | string; // 地点ID
  category?: string; // 类别
  status?: string; // 状态
  quantity?: number; // 数量
  amount?: number; // 金额
  amountCurrency?: string; // 货币单位
  acquisitionDate?: Date; // 获得日期
  isContainer: boolean; // 是否为容器
  containedItems?: (ObjectId | string)[]; // 包含的物品
  notes?: StructuredNote[]; // 结构化备注
  photo?: string; // 照片URL
}

// 地点接口
export interface Location extends BaseDocument {
  name: string; // 地点名称
  type?: string; // 类型
  parentLocationId?: ObjectId | string; // 父位置ID
  childLocations?: (ObjectId | string)[]; // 子位置ID数组
  address?: string; // 详细地址
  coordinates?: {
    // 地理坐标
    latitude?: number;
    longitude?: number;
  };
  openingHours?: string; // 开放时间
  phone?: string; // 联系电话
  notes?: string; // 备注
}

// 联系人接口
export interface Contact extends BaseDocument {
  name: string; // 联系人名称
  birthDate?: Date; // 出生日期
  phone?: string; // 电话
  email?: string; // 电子邮件
  hukou?: string; // 户籍
  school?: string; // 学校
  residence?: string; // 居住地
  detailedResidence?: string; // 详细居住地
  workAddress?: string; // 公司地址
  socialMedia?: string; // 社交媒体链接
  avatar?: string; // 头像URL
  hobbies?: string; // 兴趣爱好
  relationship?: string; // 关系类型
  tags?: string[]; // 标签数组
  notes?: Array<{
    // 笔记系统
    content: string; // 笔记内容
    createdAt: Date; // 创建时间
    tags?: string[]; // 笔记标签
  }>;
}

// 生物数据接口
export interface BioData extends BaseDocument {
  recordName: string; // 测量记录名称
  measurementType: string; // 测量类型
  value: number; // 数值
  unit?: string; // 单位
  context?: string; // 情境
  notes?: StructuredNote[]; // 备注
  isLatest: boolean; // 是否最新
  measuredAt: Date; // 测量时间
}

/**
 * 任务所需资源接口
 */
export interface RequiredResource {
  /** 资源名称，例如 "设计师张三", "会议室A01", "项目预算", "需求文档v1.2" */
  name: string;
  /** 资源类型，例如 "person", "equipment", "location", "budget", "document", "software" */
  type: string;
  /** (可选) 所需数量或额度 */
  quantity?: number | string; // 例如 2 (小时/个), "1000元"
  /** (可选) 资源的具体ID (例如，如果是系统管理的实体) */
  resourceId?: ObjectId | string;
  /** (可选) 关于此资源的备注或具体要求 */
  notes?: StructuredNote;
  /** (可选) 此资源是否为关键瓶颈资源 */
  isCritical?: boolean;
  /** (可选) 资源满足状态 */
  status?: "pending" | "allocated" | "unavailable" | "acquired";
}

/**
 * 任务接口 (增强版)
 */
export interface Task extends BaseDocument {
  name: string;
  status: string;
  description?: string;
  dueDate?: Date;
  deadlineType?: "soft" | "hard";
  scheduledStartTime?: Date;
  scheduledEndTime?: Date;
  estimatedEffortHours?: number;
  actualEffortHours?: number;
  completionDate?: Date;
  preferredTimeOfDay?: "morning" | "afternoon" | "evening" | "any" | string;
  contextualTags?: string[];
  priority?: "最高" | "高" | "中" | "低" | string;
  importanceScore?: number;
  urgencyScore?: number;
  taskType?: string;
  projectId?: ObjectId | string;
  dependencies?: ObjectId[];
  subTasks?: ObjectId[];
  requiredResources?: RequiredResource[];
  difficulty?: "very_low" | "low" | "medium" | "high" | "very_high" | number;
  energyLevelRequired?: "low" | "medium" | "high";
  assigneeId?: ObjectId | string;
  assigneeName?: string;
  delegatedTo?: ObjectId | string;
  isRecurring?: boolean;
  recurrenceRule?: string;
  nextRecurrenceDate?: Date;
  isOverdue?: boolean;
  workloadLevel?: string;
  tags?: string[];
  notes?: StructuredNote[];
}

/**
 * 记忆模式接口 (Memory Pattern)
 * 用于定义检索记忆的结构化模式。
 */
export interface MemoryPattern {
  /**
   * 模式类型，指明记忆的来源或性质。
   * 例如: "user_query", "tool_trigger", "entity_state_change", "user_preference", "learned_fact"
   */
  type: string;

  /**
   * (可选) 意图，更具体地描述该模式所代表的用户意图或系统事件。
   * 例如: "find_item_location", "get_travel_time", "schedule_meeting", "task_completion_event"
   */
  intent?: string;

  /**
   * (可选) 从原始输入或事件中提取的关键信息或词语。
   */
  keywords?: string[];

  /**
   * (可选) 模式中涉及的关键实体（非严格ID，更多是概念性描述）。
   * 用于更灵活的模式匹配，例如按实体类型或名称中的关键词匹配。
   */
  entitiesInvolved?: Array<{
    type: string; // 例如: "item", "contact", "task", "location"
    identifier?: string; // 例如: 物品名称关键词, 联系人角色, 任务类别
    attributes?: Record<string, any>; // 例如: { category: "electronics" }
    role?: string; // 实体在此模式中的角色, e.g., "origin_location", "target_person"
  }>;

  /**
   * (可选) 用于更复杂、自定义的模式结构。
   * 可以是任何对象，其结构由具体的模式类型和意图决定。
   */
  structure?: any;

  /**
   * (可选) 自定义数据，用于存储特定于模式的数据
   */
  customData?: Record<string, any>;
}

/**
 * 增强记忆单元 (Enhanced Memory Unit)
 * Reminisce 系统存储信息的核心数据结构。
 * 它继承自您项目中的 BaseDocument。
 */
export interface EnhancedMemoryUnit extends BaseDocument {
  /**
   * 用于检索此记忆的结构化模式。
   */
  pattern?: MemoryPattern;

  /**
   * 此记忆单元涉及的核心实体。
   * 将记忆锚定到系统中的具体对象。
   */
  entities?: Array<{
    id: ObjectId; // 关联到系统内其他集合文档的 ObjectId (e.g., Contact, Task, Item)
    type: string; // 实体类型 (e.g., "contact", "task", "item", "location", "biodata")
    /**
     * (可选) 该实体在此记忆中的角色。
     * 例如，在“A打电话给B”的记忆中，A是`caller`，B是`callee`。
     */
    role?: string;
  }>;

  /**
   * (可选) 此记忆单元直接表述的实体间的简单关系。
   * 例如：用户A（contact）“认识”用户B（contact）。
   */
  relationships?: Array<{
    sourceEntityId: ObjectId;
    relationshipType: string; // 例如："knows", "works_for", "owns_item"
    targetEntityId: ObjectId;
    direction?: "to" | "from" | "bi"; // 关系方向
    context?: string; // 关系的附加上下文，例如 "works_for (项目Alpha)"
  }>;

  /**
   * 记忆的核心内容或工具执行的结果。
   */
  result?: any;

  /**
   * (可选) 对 result 的简短文本摘要，方便快速预览或用于生成提示。
   */
  summary?: string;

  /**
   * 产生此记忆时的上下文信息。
   */
  context?: {
    sessionId?: string;
    conversationId?: string;
    userId?: string;
    sourceTool?: string;
    sourceEvent?: string;
    userInput?: string;
    timestamp?: Date;
    locationContext?: ObjectId | string;
    // ... 其他自定义上下文信息
  };

  /**
   * 记忆的可信度或准确性评估 (0.0 到 1.0)。
   */
  confidence?: number;

  /**
   * 记忆的重要性评估 (0.0 到 1.0)。
   */
  importance?: number;

  /**
   * 记忆的层级或类型。
   */
  tier?: "short" | "medium" | "long" | string;

  /**
   * 此记忆单元最后被访问或回忆的时间。
   */
  lastAccessed?: Date;

  /**
   * 此记忆单元被访问或回忆的次数。
   */
  accessCount?: number;

  /**
   * (可选) 指向其他相关联的 EnhancedMemoryUnit 的 ObjectId 列表。
   */
  relatedMemories?: ObjectId[];

  /**
   * (可选) 某些短期或临时记忆可能有过期时间。
   */
  expiresAt?: Date;

  /**
   * (可选) 额外的元数据标签，方便分类和检索此记忆单元本身。
   */
  tags?: string[];
}

/**
 * 用户任务绩效记忆的结果结构
 * (对应 TasksModel 中学习的任务完成洞察)
 */
export interface UserTaskPerformanceMemoryResult {
  taskId: string; // ObjectId as string
  taskName: string;
  taskType?: string;
  estimatedEffortHours?: number;
  actualEffortHours?: number;
  completionDate?: Date;
  timeOfDayCompleted?: number; // 0-23 (小时)
  dayOfWeekCompleted?: number; // 0 (周日) - 6 (周六)
  contextualTagsAtCompletion?: string[];
  deviationFromEstimateHours?: number; // actual - estimated
  completedOnTime?: boolean;
  difficulty?: Task["difficulty"];
  energyLevelRequired?: Task["energyLevelRequired"];
  // 可以添加更多从 task 或 context 中提取的、用于分析绩效的字段
}

/**
 * 用户日程安排偏好记忆的结果结构
 * (对应 PlanningTool.learnSchedulingPreference 中学习的偏好)
 */
export interface UserSchedulingPreferenceMemoryResult {
  preferenceType: string; // 例如: "timing", "task_grouping", "energy_matching", "location_constraint"
  description: string; // 用户对偏好的自然语言描述
  details?: any; // 关于偏好的具体结构化细节
  // 例如:
  // if preferenceType === "timing": { taskType?: string, preferredTimeOfDay?: "morning"|"afternoon", preferredDaysOfWeek?: number[] }
  // if preferenceType === "location_constraint": { taskType?: string, requiredLocationId?: string, requiredLocationTags?: string[] }
  importance?: number; // 用户定义的偏好重要性
  isActive?: boolean; // 此偏好当前是否激活 (默认为true)
  // 可以添加更多字段来细化偏好，如适用范围（例如，只对“工作”类任务有效）
}

/**
 * 日程事件接口 (ScheduledEvent / CalendarEntry)
 * 代表在日历/日程表中的一个具体时间安排。
 * 可以是一个被调度的任务，也可以是一个独立的事件（如会议、约会）。
 */
export interface ScheduledEvent extends BaseDocument {
  /** 事件标题 (例如，任务名称、会议主题) */
  title: string;
  /** 事件开始的UTC时间 */
  startTime: Date;
  /** 事件结束的UTC时间 */
  endTime: Date;
  /** (可选) 是否为全天事件，如果是，则 startTime 和 endTime 通常表示当天的开始和结束 */
  isAllDay?: boolean;
  /** (可选) 事件的详细描述 */
  description?: string;

  /**
   * 事件类型，用于区分不同性质的日程安排。
   * "task": 由 Task 实体生成的日程条目。
   * "meeting": 会议。
   * "appointment": 预约（例如看医生）。
   * "personal_block": 个人预留时间（例如锻炼、午休）。
   * "reminder": 提醒事项 (可能没有时长，只有时间点)。
   * 允许自定义字符串。
   */
  eventType:
    | "task"
    | "meeting"
    | "appointment"
    | "personal_block"
    | "reminder"
    | string;

  /** (可选) 如果此日程事件关联到一个具体的 Task，则记录其ID */
  taskId?: ObjectId | string;
  /** (可选) 事件发生的地点ID */
  locationId?: ObjectId | string;
  /** (可选) 事件发生的具体地点描述 (如果不是系统内的Location实体) */
  locationDescription?: string;

  /** (可选) 参与者列表 (例如会议参与人) */
  participants?: Array<{
    contactId?: ObjectId | string; // 关联到 Contact 实体的ID
    name: string; // 参与者名称
    email?: string;
    role?: "required" | "optional" | "organizer";
    status?: "accepted" | "declined" | "tentative" | "needs_action"; // 参与状态
  }>;

  /** (可选) 事件状态 */
  status?: "confirmed" | "tentative" | "cancelled" | "completed";

  /** (可选) 是否为重复事件的基础事件或某个实例 */
  isRecurringInstance?: boolean;
  /** (可选) 如果是重复事件的实例，指向其主事件的ID */
  recurringEventId?: ObjectId | string;
  /** (可选) 如果是重复事件的特定实例，其原始计划开始时间（用于处理例外情况） */
  originalStartTime?: Date;

  /** (可选) 提醒设置 */
  reminders?: Array<{
    method: "popup" | "email" | "sms";
    minutesBefore: number;
  }>;

  /** (可选) 事件颜色标签，用于在日历上显示 */
  color?: string;
}

// 类型守卫函数 - 检查一个值是否为ObjectId类型
export function isObjectId(id: any): id is ObjectId {
  return (
    id instanceof ObjectId ||
    (typeof id === "object" &&
      id !== null &&
      id.constructor &&
      id.constructor.name === "ObjectId")
  );
}

// 辅助函数 - 确保ID为ObjectId类型
export function ensureObjectId(id: string | ObjectId): ObjectId {
  if (isObjectId(id)) {
    return id;
  }
  return new ObjectId(id);
}

// 位置关系映射类型
export interface LocationRelation {
  locationId: ObjectId | string;
  parentId?: ObjectId | string;
  childrenIds?: (ObjectId | string)[];
}

// 物品容器关系映射类型
export interface ContainerRelation {
  containerId: ObjectId | string;
  containerName?: string;
  itemIds: (ObjectId | string)[];
}

// 结构化响应类型
export interface StructuredItemLocationResponse {
  itemName: string;
  itemId?: string;
  location?: {
    name: string;
    id?: string;
    address?: string;
  };
  container?: {
    name: string;
    id?: string;
    isContainer: boolean;
  };
  status?: string;
  lastUpdate?: string;
  notes?: string[];
}

// 时间估算响应类型
export interface TravelTimeEstimationResponse {
  origin: {
    name: string;
    id?: string;
  };
  destination: {
    name: string;
    id?: string;
  };
  estimatedTime: number;
  unit: string;
  context?: string;
  baseSpeed?: number;
  speedUnit?: string;
  notes?: string;
  route?: any;
}
