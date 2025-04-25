// src/utils/memoryUtils.ts
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { EntityRelationshipType } from "../model/memory.js";

/**
 * 为工具名称和抽象参数生成模板哈希
 * @param toolName 工具名称
 * @param abstractParams 抽象后的参数
 * @returns 哈希字符串
 */
export function generateTemplateHash(
  toolName: string,
  abstractParams: any
): string {
  const content = toolName + JSON.stringify(abstractParams);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * 抽象查询参数，替换具体值为类型标记
 * @param toolName 工具名称
 * @param params 原始参数
 * @returns 抽象后的参数
 */
export function abstractQueryParameters(toolName: string, params: any): any {
  // 创建参数副本并标准化
  const abstractParams = { ...params };

  // 参数标准化处理
  if (abstractParams.itemName) {
    abstractParams.itemName = abstractParams.itemName
      .toLowerCase()
      .trim()
      .normalize('NFKC');
  }

  // 根据工具类型进行特定处理
  switch (toolName) {
    case "find_item":
      // 保留查询模式但抽象具体值
      if (abstractParams.itemName) {
        abstractParams.itemName = "<ITEM_NAME>";
      }
      if (abstractParams.exactMatch !== undefined) {
        // 保留布尔值，不做抽象
      }
      break;

    case "estimate_time":
      if (abstractParams.origin) {
        abstractParams.origin = "<LOCATION>";
      }
      if (abstractParams.destination) {
        abstractParams.destination = "<LOCATION>";
      }
      break;

    case "query_item":
      if (abstractParams.itemId) {
        abstractParams.itemId = "<ITEM_ID>";
      }
      if (abstractParams.search) {
        abstractParams.search = "<SEARCH_TERM>";
      }
      if (abstractParams.containerId) {
        abstractParams.containerId = "<CONTAINER_ID>";
      }
      // 保留 containerItems 布尔值
      break;

    case "query_location":
      if (abstractParams.locationId) {
        abstractParams.locationId = "<LOCATION_ID>";
      }
      if (abstractParams.search) {
        abstractParams.search = "<SEARCH_TERM>";
      }
      if (abstractParams.hierarchyFor) {
        abstractParams.hierarchyFor = "<LOCATION_ID>";
      }
      if (abstractParams.childrenOf) {
        abstractParams.childrenOf = "<LOCATION_ID>";
      }
      break;

    case "query_contact":
      if (abstractParams.contactId) {
        abstractParams.contactId = "<CONTACT_ID>";
      }
      if (abstractParams.search) {
        abstractParams.search = "<SEARCH_TERM>";
      }
      if (abstractParams.relationship) {
        abstractParams.relationship = "<RELATIONSHIP>";
      }
      if (abstractParams.tag) {
        abstractParams.tag = "<TAG>";
      }
      if (abstractParams.school) {
        abstractParams.school = "<SCHOOL>";
      }
      if (abstractParams.hukou) {
        abstractParams.hukou = "<HUKOU>";
      }
      break;

    case "query_biodata":
      if (abstractParams.recordId) {
        abstractParams.recordId = "<BIODATA_ID>";
      }
      if (abstractParams.measurementType) {
        abstractParams.measurementType = "<MEASUREMENT_TYPE>";
      }
      // 保留 history, stats, measurementTypes 布尔值
      if (abstractParams.search) {
        abstractParams.search = "<SEARCH_TERM>";
      }
      break;

    case "query_task":
      if (abstractParams.taskId) {
        abstractParams.taskId = "<TASK_ID>";
      }
      if (abstractParams.tag) {
        abstractParams.tag = "<TAG>";
      }
      if (abstractParams.taskType) {
        abstractParams.taskType = "<TASK_TYPE>";
      }
      // 保留布尔值和数字值
      break;

    case "transfer_item":
      if (abstractParams.itemId) {
        abstractParams.itemId = "<ITEM_ID>";
      }
      if (abstractParams.itemName) {
        abstractParams.itemName = "<ITEM_NAME>";
      }
      if (abstractParams.targetLocationId) {
        abstractParams.targetLocationId = "<LOCATION_ID>";
      }
      if (abstractParams.targetLocationName) {
        abstractParams.targetLocationName = "<LOCATION_NAME>";
      }
      if (abstractParams.targetContainerId) {
        abstractParams.targetContainerId = "<CONTAINER_ID>";
      }
      if (abstractParams.targetContainerName) {
        abstractParams.targetContainerName = "<CONTAINER_NAME>";
      }
      // 保留 note 和 removeFromCurrentContainer
      break;

    case "update_task_status":
      if (abstractParams.taskId) {
        abstractParams.taskId = "<TASK_ID>";
      }
      if (abstractParams.taskName) {
        abstractParams.taskName = "<TASK_NAME>";
      }
      // 保留 newStatus 和 comment
      break;

    case "add_structured_note":
      // 保留 entityType
      if (abstractParams.entityId) {
        abstractParams.entityId = "<ENTITY_ID>";
      }
      if (abstractParams.entityName) {
        abstractParams.entityName = "<ENTITY_NAME>";
      }
      // 内容和标签是关键信息，不抽象
      break;

    case "search_notes":
      if (abstractParams.tag) {
        abstractParams.tag = "<TAG>";
      }
      // 保留 entityType
      if (abstractParams.entityId) {
        abstractParams.entityId = "<ENTITY_ID>";
      }
      if (abstractParams.entityName) {
        abstractParams.entityName = "<ENTITY_NAME>";
      }
      break;

    case "get_latest_biodata":
      if (abstractParams.measurementType) {
        abstractParams.measurementType = "<MEASUREMENT_TYPE>";
      }
      // 保留布尔值和数字值
      break;

    case "get_pending_tasks":
      // 保留大部分布尔值和数字值
      if (abstractParams.taskId) {
        abstractParams.taskId = "<TASK_ID>";
      }
      if (abstractParams.taskType) {
        abstractParams.taskType = "<TASK_TYPE>";
      }
      break;
  }

  return abstractParams;
}

/**
 * 从参数中提取实体依赖
 * @param toolName 工具名称
 * @param params 原始参数
 * @returns 实体依赖数组
 */
export function extractEntityDependencies(
  toolName: string,
  params: any
): Array<{
  entityType: string;
  entityId: ObjectId;
  relationshipType: EntityRelationshipType;
}> {
  const dependencies: Array<{
    entityType: string;
    entityId: ObjectId;
    relationshipType: EntityRelationshipType;
  }> = [];

  // 工具特定逻辑
  switch (toolName) {
    case "find_item":
      // 从查找结果中提取物品ID
      if (params.itemId && isObjectIdString(params.itemId)) {
        dependencies.push({
          entityType: "item",
          entityId: new ObjectId(params.itemId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (params.itemIds && Array.isArray(params.itemIds)) {
        for (const id of params.itemIds) {
          if (isObjectIdString(id)) {
            dependencies.push({
              entityType: "item",
              entityId: new ObjectId(id),
              relationshipType: EntityRelationshipType.PRIMARY,
            });
          }
        }
      }
      break;

    case "estimate_time":
      if (params.origin && isObjectIdString(params.origin)) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.origin),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (params.destination && isObjectIdString(params.destination)) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.destination),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "query_item":
      if (params.itemId && isObjectIdString(params.itemId)) {
        dependencies.push({
          entityType: "item",
          entityId: new ObjectId(params.itemId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (params.containerId && isObjectIdString(params.containerId)) {
        dependencies.push({
          entityType: "item",
          entityId: new ObjectId(params.containerId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "query_location":
      if (params.locationId && isObjectIdString(params.locationId)) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.locationId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (params.hierarchyFor && isObjectIdString(params.hierarchyFor)) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.hierarchyFor),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (params.childrenOf && isObjectIdString(params.childrenOf)) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.childrenOf),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "query_contact":
      if (params.contactId && isObjectIdString(params.contactId)) {
        dependencies.push({
          entityType: "contact",
          entityId: new ObjectId(params.contactId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "query_biodata":
      if (params.recordId && isObjectIdString(params.recordId)) {
        dependencies.push({
          entityType: "biodata",
          entityId: new ObjectId(params.recordId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "query_task":
      if (params.taskId && isObjectIdString(params.taskId)) {
        dependencies.push({
          entityType: "task",
          entityId: new ObjectId(params.taskId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "transfer_item":
      if (params.itemId && isObjectIdString(params.itemId)) {
        dependencies.push({
          entityType: "item",
          entityId: new ObjectId(params.itemId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      if (
        params.targetLocationId &&
        isObjectIdString(params.targetLocationId)
      ) {
        dependencies.push({
          entityType: "location",
          entityId: new ObjectId(params.targetLocationId),
          relationshipType: EntityRelationshipType.SECONDARY,
        });
      }
      if (
        params.targetContainerId &&
        isObjectIdString(params.targetContainerId)
      ) {
        dependencies.push({
          entityType: "item",
          entityId: new ObjectId(params.targetContainerId),
          relationshipType: EntityRelationshipType.SECONDARY,
        });
      }
      break;

    case "update_task_status":
      if (params.taskId && isObjectIdString(params.taskId)) {
        dependencies.push({
          entityType: "task",
          entityId: new ObjectId(params.taskId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;

    case "add_structured_note":
      if (params.entityId && isObjectIdString(params.entityId)) {
        dependencies.push({
          entityType: params.entityType,
          entityId: new ObjectId(params.entityId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      // 处理相关实体
      if (params.relatedEntities && Array.isArray(params.relatedEntities)) {
        for (const related of params.relatedEntities) {
          if (related.id && isObjectIdString(related.id)) {
            dependencies.push({
              entityType: related.type,
              entityId: new ObjectId(related.id),
              relationshipType: EntityRelationshipType.REFERENCE,
            });
          }
        }
      }
      break;

    case "search_notes":
      if (params.entityId && isObjectIdString(params.entityId)) {
        dependencies.push({
          entityType: params.entityType,
          entityId: new ObjectId(params.entityId),
          relationshipType: EntityRelationshipType.PRIMARY,
        });
      }
      break;
  }

  return dependencies;
}

/**
 * 计算参数相似度
 * @param params1 参数1
 * @param params2 参数2
 * @returns 相似度(0-1)
 */
export function calculateParameterSimilarity(
  params1: any,
  params2: any
): number {
  // 如果参数类型不同，返回0
  if (typeof params1 !== typeof params2) {
    return 0;
  }

  // 如果参数是基本类型，直接比较
  if (typeof params1 !== "object" || params1 === null || params2 === null) {
    if (typeof params1 === 'string' && typeof params2 === 'string') {
      // 标准化字符串
      const str1 = params1.toLowerCase().trim().normalize('NFKC');
      const str2 = params2.toLowerCase().trim().normalize('NFKC');
      
      // 完全匹配
      if (str1 === str2) return 1;
      
      // 重要物品名称严格匹配
      const isImportantItem = /证|卡|钥匙|重要|身份证|护照|驾驶证|学生证/i.test(str1) || 
                            /证|卡|钥匙|重要|身份证|护照|驾驶证|学生证/i.test(str2);
      
      if (isImportantItem) {
        // 重要物品必须完全匹配或包含关键部分
        const hasKeyPart = str1.includes('身份证') || str2.includes('身份证') ||
                          str1.includes('证') || str2.includes('证');
        return hasKeyPart ? 0.8 : 0;
      }
      
      // 对于普通物品名称
      if (str1.length > 3 && str2.length > 3) {
        // 检查是否包含相同关键词
        const keywords1 = str1.split(/\s+/);
        const keywords2 = str2.split(/\s+/);
        const commonKeywords = keywords1.filter(k => keywords2.includes(k));
        
        if (commonKeywords.length > 0) {
          return 0.7; // 有共同关键词则返回中等相似度
        }
        
        // 计算编辑距离相似度
        const distance = levenshteinDistance(str1, str2);
        const similarity = 1 - (distance / Math.max(str1.length, str2.length));
        
        // 只有相似度高于0.6才返回
        return similarity > 0.6 ? similarity : 0;
      }
      
      // 默认计算编辑距离相似度
      const distance = levenshteinDistance(str1, str2);
      return 1 - (distance / Math.max(str1.length, str2.length));
    }
    return params1 === params2 ? 1 : 0;
  }

  // 如果是数组，比较数组元素
  if (Array.isArray(params1) && Array.isArray(params2)) {
    if (params1.length === 0 && params2.length === 0) {
      return 1;
    }
    if (params1.length === 0 || params2.length === 0) {
      return 0;
    }

    // 计算数组交集大小
    const intersection = params1.filter((item1) =>
      params2.some((item2) => calculateParameterSimilarity(item1, item2) > 0.8)
    );

    return intersection.length / Math.max(params1.length, params2.length);
  }

  // 对于对象，比较属性
  const keys1 = Object.keys(params1);
  const keys2 = Object.keys(params2);

  if (keys1.length === 0 && keys2.length === 0) {
    return 1;
  }

  // 计算属性交集
  const commonKeys = keys1.filter((key) => keys2.includes(key));

  if (commonKeys.length === 0) {
    return 0;
  }

  // 计算各个属性的相似度并取平均值
  let totalSimilarity = 0;

  for (const key of commonKeys) {
    totalSimilarity += calculateParameterSimilarity(params1[key], params2[key]);
  }

  // 最终相似度考虑属性覆盖率和值相似度
  const keyCoverage = commonKeys.length / Math.max(keys1.length, keys2.length);
  const valueSimilarity = totalSimilarity / commonKeys.length;

  return keyCoverage * valueSimilarity;
}

/**
 * 检查字符串是否为ObjectId格式
 * @param str 要检查的字符串
 * @returns 是否为ObjectId格式
 */
export function isObjectIdString(str: any): boolean {
  return typeof str === "string" && /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * 计算存储层级
 * @param toolName 工具名称
 * @param parameters 参数
 * @returns 存储层级
 */
export function calculateStorageTier(
  toolName: string,
  parameters: any,
  accessFrequency?: number
): string {
  // 默认层级映射
  const defaultTierByTool: Record<string, string> = {
    find_item: "mid_term",
    estimate_time: "mid_term",
    query_item: "mid_term",
    query_location: "long_term",
    query_contact: "long_term",
    query_biodata: "mid_term",
    query_task: "short_term",
    get_latest_biodata: "short_term",
    get_pending_tasks: "short_term",
  };

  // 基于访问频率的动态层级调整
  if (accessFrequency !== undefined) {
    if (accessFrequency > 10) return "long_term";
    if (accessFrequency > 5) return "mid_term";
    return "short_term";
  }

  // 默认层级
  const defaultTier = defaultTierByTool[toolName] || "mid_term";

  // 工具特定逻辑
  switch (toolName) {
    case "find_item":
      // 如果查询的是重要物品（如证件类），使用长期记忆
      if (
        parameters.itemName &&
        /证|卡|钥匙|重要|身份证|护照|驾驶证|学生证/i.test(parameters.itemName)
      ) {
        return "long_term";
      }
      break;

    case "estimate_time":
      // 常用路线使用长期记忆
      return "long_term";

    case "query_contact":
      // 联系人信息通常是长期有效的
      return "long_term";
  }

  return defaultTier;
}

/**
 * 计算过期时间
 * @param tier 存储层级
 * @param toolName 工具名称
 * @returns 过期时间(null表示不过期)
 */
export function calculateExpiryTime(
  tier: string,
  toolName: string
): Date | null {
  const now = new Date();

  switch (tier) {
    case "short_term":
      now.setDate(now.getDate() + 1); // 1天后过期
      return now;

    case "mid_term":
      now.setDate(now.getDate() + 14); // 2周后过期
      return now;

    case "long_term":
      return null; // 不过期

    default:
      now.setDate(now.getDate() + 7); // 默认1周
      return now;
  }
}

/**
 * 计算初始置信度
 * @param toolName 工具名称
 * @returns 初始置信度(0-1)
 */
export function calculateInitialConfidence(
  toolName: string, 
  queryCount: number = 1,
  itemName?: string
): number {
  // 不同工具的基础置信度
  const baseConfidenceByTool: Record<string, number> = {
    find_item: 0.9, // 物品查找结果通常可靠
    estimate_time: 0.7, // 时间估算有一定变数
    query_item: 0.95, // 物品查询结果非常可靠
    query_location: 0.95, // 位置查询结果非常可靠
    query_contact: 0.95, // 联系人查询结果非常可靠
    query_biodata: 0.85, // 生物数据查询结果较可靠
    query_task: 0.8, // 任务查询可能变化较快
    get_latest_biodata: 0.85, // 最新生物数据较可靠
    get_pending_tasks: 0.7, // 待办任务变化快
  };

  // 基于查询次数调整置信度
  const baseConfidence = baseConfidenceByTool[toolName] || 0.8;
  const frequencyBonus = Math.min(0.1, queryCount * 0.02);
  
  let finalConfidence = Math.min(1, baseConfidence + frequencyBonus);
  
  // 对于物品查询，根据物品名称调整置信度
  if (toolName === "find_item" && itemName) {
    const normalizedName = itemName.toLowerCase().trim().normalize('NFKC');
    
    // 重要物品提高置信度
    if (/证|卡|钥匙|重要|身份证|护照|驾驶证|学生证/i.test(normalizedName)) {
      finalConfidence = Math.min(1, finalConfidence * 1.2);
    }
    // 模糊匹配的物品降低置信度
    else if (normalizedName.includes('?') || normalizedName.includes('*')) {
      finalConfidence = Math.max(0.5, finalConfidence * 0.8);
    }
  }
  
  return finalConfidence;
}

/**
 * 为Memory生成标签
 * @param toolName 工具名称
 * @param parameters 参数
 * @returns 标签数组
 */
// 计算Levenshtein编辑距离
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => 
    Array(a.length + 1).fill(null)
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }

  return matrix[b.length][a.length];
}

export function generateTags(toolName: string, parameters: any): string[] {
  const tags = [toolName];

  // 根据工具类型添加特定标签
  switch (toolName) {
    case "find_item":
      tags.push("item_location");
      break;

    case "estimate_time":
      tags.push("travel_time");
      break;

    case "query_item":
      tags.push("item_info");
      break;

    case "query_location":
      tags.push("location_info");
      break;

    case "query_contact":
      tags.push("contact_info");
      break;

    case "query_biodata":
      tags.push("biodata_info");
      if (parameters.measurementType) {
        tags.push(`measurement_${parameters.measurementType}`);
      }
      break;

    case "query_task":
      tags.push("task_info");
      break;
  }

  return tags;
}
