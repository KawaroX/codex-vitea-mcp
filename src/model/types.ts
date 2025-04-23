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
  notes?: string | StructuredNote[]; // 备注
  isLatest: boolean; // 是否最新
  measuredAt: Date; // 测量时间
}

// 任务接口
export interface Task extends BaseDocument {
  name: string; // 任务名称
  status: string; // 状态
  dueDate?: Date; // 截止日期
  priority?: string; // 优先级
  taskType?: string; // 任务类型
  description?: string; // 描述
  isOverdue?: boolean; // 是否逾期
  workloadLevel?: string; // 工作量等级
  assignee?: string; // 负责人
  tags?: string[]; // 任务标签
  notes?: string | StructuredNote[]; // 备注，可以是字符串或结构化备注数组
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
}
