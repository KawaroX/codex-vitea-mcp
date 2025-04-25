import crypto from "crypto";
import { ObjectId } from "mongodb";
import { EntityRelationshipType } from "../model/memory.js";
import {
  getToolConfig,
  getCategoryConfig,
  getExpiryDays,
  isToolMemoryEnabled,
  isCategoryMemoryEnabled,
} from "../config/memory-config.js";

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
  // 创建参数副本
  const abstractParams = { ...params };

  // 标准化处理
  Object.keys(abstractParams).forEach((key) => {
    if (typeof abstractParams[key] === "string") {
      abstractParams[key] = abstractParams[key].trim();
    }
  });

  // 移除时间戳等非关键参数
  delete abstractParams._queryTime;
  delete abstractParams.timestamp;

  // 根据工具类型进行特定处理
  switch (toolName) {
    case "find_item":
      if (abstractParams.itemName) {
        // 标准化物品名称
        const normalizedName = abstractParams.itemName.toLowerCase().trim();

        // 添加类别信息但保留抽象名称标记
        abstractParams.itemCategory = categorizeItem(normalizedName);
        abstractParams.itemName = `<${abstractParams.itemCategory}>`;
      }
      // 保留 exactMatch 标志，不做抽象
      break;

    case "estimate_time":
      // 添加路线类型信息
      if (abstractParams.origin && abstractParams.destination) {
        abstractParams.routeType = categorizeRoute(
          abstractParams.origin,
          abstractParams.destination
        );
      }

      // 替换为抽象标记
      if (abstractParams.origin) {
        abstractParams.origin = "<ORIGIN>";
      }
      if (abstractParams.destination) {
        abstractParams.destination = "<DESTINATION>";
      }
      break;

    // 其他工具类型的处理...
    case "query_item":
    case "query_location":
    case "query_contact":
    case "query_biodata":
    case "query_task":
    case "get_latest_biodata":
    case "get_pending_tasks":
      // 为这些工具实现相应的抽象逻辑...
      break;
  }

  return abstractParams;
}

/**
 * 对物品进行分类，基于通用特征
 */
export function categorizeItem(itemName: string): string {
  if (!itemName) return "UNKNOWN";

  const name = itemName.toLowerCase().trim();

  // 检查物品类别
  if (/证|证件|证书|身份|护照|驾驶|学生证|工作证/.test(name)) {
    return "DOCUMENT";
  }

  if (/钱|钱包|现金|银行卡|信用卡|存折|财物|贵重/.test(name)) {
    return "VALUABLE";
  }

  if (/钥匙|门卡|门禁|磁卡|锁/.test(name)) {
    return "KEY";
  }

  if (/手机|电脑|笔记本|平板|相机|硬盘|电子|设备/.test(name)) {
    return "ELECTRONICS";
  }

  if (/书|书本|教材|笔|钢笔|中性笔|铅笔|橡皮|文具|纸/.test(name)) {
    return "STATIONERY";
  }

  if (/衣|衣服|裤|裤子|袜|袜子|鞋|鞋子|衬衫|外套|帽|帽子|围巾/.test(name)) {
    return "CLOTHING";
  }

  if (/药|药水|药片|药膏|医|医疗|治疗/.test(name)) {
    return "MEDICINE";
  }

  if (/包|背包|书包|袋|箱|箱子|盒|盒子/.test(name)) {
    return "CONTAINER";
  }

  if (/食品|食物|吃的|喝的|零食|饮料|水|茶|咖啡/.test(name)) {
    return "FOOD";
  }

  // 无法分类的返回MISC类别
  return "MISC";
}

/**
 * 对路线进行分类，基于通用特征
 */
export function categorizeRoute(origin: string, destination: string): string {
  // 如果有明确的场景词，进行分类
  const originLower = typeof origin === "string" ? origin.toLowerCase() : "";
  const destLower =
    typeof destination === "string" ? destination.toLowerCase() : "";

  // 校园场景
  if (
    /学院|大学|学校|校区|教学楼|宿舍|公寓|图书馆|食堂/.test(
      originLower + destLower
    )
  ) {
    return "CAMPUS";
  }

  // 商业场景
  if (/商场|超市|购物|商店|店铺|市场/.test(originLower + destLower)) {
    return "SHOPPING";
  }

  // 通勤场景
  if (/公司|单位|工作|办公/.test(originLower + destLower)) {
    return "COMMUTE";
  }

  // 无法分类的返回通用类型
  return "GENERAL";
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
  // 不同类型参数直接返回0
  if (typeof params1 !== typeof params2) {
    return 0;
  }

  // 基本类型比较
  if (typeof params1 !== "object" || params1 === null || params2 === null) {
    if (typeof params1 === "string" && typeof params2 === "string") {
      return calculateStringSimilarity(params1, params2);
    }
    return params1 === params2 ? 1 : 0;
  }

  // 数组类型
  if (Array.isArray(params1) && Array.isArray(params2)) {
    if (params1.length === 0 && params2.length === 0) return 1;
    if (params1.length === 0 || params2.length === 0) return 0;

    const intersection = params1.filter((item1) =>
      params2.some((item2) => calculateParameterSimilarity(item1, item2) > 0.8)
    );

    return intersection.length / Math.max(params1.length, params2.length);
  }

  // 对象类型 - 基于共同属性计算
  const keys1 = Object.keys(params1);
  const keys2 = Object.keys(params2);

  if (keys1.length === 0 && keys2.length === 0) return 1;

  const commonKeys = keys1.filter((key) => keys2.includes(key));
  if (commonKeys.length === 0) return 0;

  let totalSimilarity = 0;
  for (const key of commonKeys) {
    // 对于特殊键值进行比较
    if (key === "itemCategory" && params1[key] !== params2[key]) {
      return 0.3; // 不同类别的相似度较低
    }

    if (key === "routeType" && params1[key] !== params2[key]) {
      return 0.2; // 不同路线类型相似度更低
    }

    totalSimilarity += calculateParameterSimilarity(params1[key], params2[key]);
  }

  // 考虑属性覆盖率和值相似度
  const keyCoverage = commonKeys.length / Math.max(keys1.length, keys2.length);
  const valueSimilarity = totalSimilarity / commonKeys.length;

  return keyCoverage * valueSimilarity;
}

/**
 * 计算字符串相似度
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  // 标准化
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // 完全匹配
  if (s1 === s2) return 1.0;

  // 为空的情况
  if (s1.length === 0 || s2.length === 0) return 0;

  // 提取关键词
  const tokens1 = s1.split(/\s+/).filter((w) => w.length > 1);
  const tokens2 = s2.split(/\s+/).filter((w) => w.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) {
    // 基于字符级别的相似度
    const distance = levenshteinDistance(s1, s2);
    return 1 - distance / Math.max(s1.length, s2.length);
  }

  // 计算共同关键词
  const commonTokens = tokens1.filter((t) => tokens2.includes(t));
  return commonTokens.length / Math.max(tokens1.length, tokens2.length);
}

/**
 * 检查是否为重要数据
 * 用于决定是否缓存和缓存策略
 */
export function isImportantData(toolName: string, params: any): boolean {
  // 检查工具是否启用记忆
  if (!isToolMemoryEnabled(toolName)) {
    return true; // 工具未启用记忆，视为重要数据
  }

  switch (toolName) {
    case "find_item":
      if (params.itemName) {
        const category = categorizeItem(params.itemName);
        // 检查物品类别是否启用记忆
        return !isCategoryMemoryEnabled(category);
      }
      break;

    case "get_latest_biodata":
    case "get_pending_tasks":
      // 实时性要求高的工具
      return true;

    case "query_task":
      // 任务状态通常需要实时性
      return true;
  }

  return false;
}

/**
 * 计算存储层级
 * @param toolName 工具名称
 * @param parameters 参数
 * @returns 存储层级
 */
export function calculateStorageTier(toolName: string, params: any): string {
  // 获取工具配置的默认层级
  const defaultTier = getToolConfig(toolName).defaultTier;

  // 工具特定逻辑
  switch (toolName) {
    case "find_item":
      if (params.itemName) {
        // 如果查询的是重要物品，使用短期记忆
        const category = categorizeItem(params.itemName);
        return getCategoryConfig(category).defaultTier;
      }
      break;

    case "estimate_time":
      // 路线通常是长期记忆
      return "long_term";
  }

  return defaultTier;
}

/**
 * 计算初始置信度
 * @param toolName 工具名称
 * @returns 初始置信度(0-1)
 */
export function calculateInitialConfidence(
  toolName: string,
  params: any = {}
): number {
  // 获取工具配置的默认置信度
  const defaultConfidence = getToolConfig(toolName).initialConfidence;

  // 对于物品查询，使用物品类别的配置
  if (toolName === "find_item" && params.itemName) {
    const category = categorizeItem(params.itemName);
    return getCategoryConfig(category).initialConfidence;
  }

  return defaultConfidence;
}

/**
 * 计算过期时间
 */
export function calculateExpiryTime(
  tier: string,
  toolName: string,
  params: any = {}
): Date | null {
  const now = new Date();

  // 获取层级的过期天数
  const expiryDays = getExpiryDays(tier as any);

  // 如果过期天数为null，表示不过期
  if (expiryDays === null) {
    return null;
  }

  // 对重要数据缩短有效期或禁用缓存
  if (isImportantData(toolName, params)) {
    // 重要数据使用更短的过期时间
    now.setHours(now.getHours() + 1); // 1小时
    return now;
  }

  // 普通数据使用标准过期时间
  now.setDate(now.getDate() + expiryDays);
  return now;
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
 * 检查字符串是否为ObjectId格式
 * @param str 要检查的字符串
 * @returns 是否为ObjectId格式
 */
export function isObjectIdString(str: any): boolean {
  return typeof str === "string" && /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * 为Memory生成标签
 * @param toolName 工具名称
 * @param parameters 参数
 * @returns 标签数组
 */

// 计算Levenshtein编辑距离
export function levenshteinDistance(a: string, b: string): number {
  // 优化: 处理特殊情况
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 如果字符串很长，使用优化的算法
  if (a.length > 100 || b.length > 100) {
    return optimizedLevenshteinDistance(a, b);
  }

  // 创建距离矩阵
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  // 初始化第一行和第一列
  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  // 填充矩阵
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // 删除
        matrix[j - 1][i] + 1, // 插入
        matrix[j - 1][i - 1] + substitutionCost // 替换
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

/**
 * 优化版Levenshtein距离计算
 * 仅保留两行数据，减少内存消耗
 */
function optimizedLevenshteinDistance(a: string, b: string): number {
  // 确保a是较短的字符串
  if (a.length > b.length) {
    const temp = a;
    a = b;
    b = temp;
  }

  // 创建两行数组而非完整矩阵
  let previousRow = Array(a.length + 1).fill(0);
  let currentRow = Array(a.length + 1).fill(0);

  // 初始化第一行
  for (let i = 0; i <= a.length; i++) {
    previousRow[i] = i;
  }

  // 填充剩余行
  for (let j = 1; j <= b.length; j++) {
    currentRow[0] = j;

    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[i] = Math.min(
        currentRow[i - 1] + 1, // 删除
        previousRow[i] + 1, // 插入
        previousRow[i - 1] + substitutionCost // 替换
      );
    }

    // 交换行，重用数组
    const temp = previousRow;
    previousRow = currentRow;
    currentRow = temp;
  }

  // 结果在previousRow的最后一个元素
  return previousRow[a.length];
}
