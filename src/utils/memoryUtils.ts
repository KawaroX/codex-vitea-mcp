// 完全重写，专注于复杂度评估和记忆价值判断

import crypto from "crypto";
import { ObjectId } from "mongodb";

// 查询类型枚举
export enum QueryType {
  SIMPLE = "simple", // 简单查询
  MEDIUM_COMPLEX = "medium", // 中等复杂查询
  HIGHLY_COMPLEX = "complex", // 高度复杂查询
  COMPOUND = "compound", // 复合查询
}

// 创建一个包含查询复杂度和其他元数据的结构
export interface QueryAnalysis {
  complexityScore: number; // 复杂度分数
  queryType: QueryType; // 查询类型
  shouldCache: boolean; // 是否应该缓存
  expiryDays: number | null; // 过期天数
  initialConfidence: number; // 初始置信度
  cacheTier: string; // 缓存层级
  isRealtime: boolean; // 是否是实时数据
  metadata: any; // 其他元数据
}

/**
 * 分析查询复杂度并给出记忆策略建议
 */
export function analyzeQuery(toolName: string, params: any): QueryAnalysis {
  let complexityScore = 0;

  // 1. 工具基础复杂度
  switch (toolName) {
    // 复杂查询
    case "estimate_time":
      complexityScore += 4; // 基本复杂度高
      break;

    // 中等复杂度查询
    case "query_contact":
    case "query_location":
    case "query_biodata":
      complexityScore += 2; // 中等复杂度
      break;

    // 简单查询
    case "find_item":
    case "query_item":
      complexityScore += 1; // 低复杂度
      break;

    // 实时数据 - 不应缓存
    case "get_latest_biodata":
    case "get_pending_tasks":
      complexityScore = 0; // 不缓存
      break;

    // 写操作 - 不应缓存
    case "update_item":
    case "transfer_item":
    case "update_task_status":
    case "add_structured_note":
      complexityScore = -1; // 写操作不缓存
      break;

    default:
      complexityScore += 1; // 默认低复杂度
  }

  // 2. 参数复杂度评估
  if (params) {
    // 相关实体增加复杂度
    if (params.relatedEntities && Array.isArray(params.relatedEntities)) {
      complexityScore += params.relatedEntities.length * 0.5;
    }

    // 如果请求包含多个ID或搜索条件，增加复杂度
    const paramKeys = Object.keys(params);
    if (paramKeys.length > 3) {
      complexityScore += 0.5;
    }

    // 特殊情况处理
    if (toolName === "find_item" && params.exactMatch === true) {
      complexityScore -= 0.5; // 精确匹配简单
    }
  }

  // 3. 确定查询类型
  let queryType = QueryType.SIMPLE;
  if (complexityScore >= 6) {
    queryType = QueryType.HIGHLY_COMPLEX;
  } else if (complexityScore >= 3) {
    queryType = QueryType.MEDIUM_COMPLEX;
  }

  // 4. 确定缓存策略
  let shouldCache = false;
  let expiryDays = 1; // 默认1天
  let initialConfidence = 0.7;
  let cacheTier = "short_term";
  let isRealtime = false;

  if (complexityScore >= 6) {
    // 高复杂度查询 - 长期缓存
    shouldCache = true;
    expiryDays = null; // 不过期
    initialConfidence = 0.9;
    cacheTier = "long_term";
  } else if (complexityScore >= 3) {
    // 中等复杂度查询 - 中期缓存
    shouldCache = true;
    expiryDays = 14; // 两周
    initialConfidence = 0.8;
    cacheTier = "mid_term";
  } else if (complexityScore > 0) {
    // 简单查询 - 短期缓存
    shouldCache = true;
    expiryDays = 1; // 一天
    initialConfidence = 0.7;
    cacheTier = "short_term";
  }

  // 实时数据和写操作不缓存
  if (complexityScore <= 0) {
    shouldCache = false;
    isRealtime = toolName.startsWith("get_");
  }

  // 5. 构建元数据
  const metadata: any = {};

  // 添加工具特定元数据
  switch (toolName) {
    case "find_item":
      if (params.itemName) {
        metadata.itemCategory = categorizeItem(params.itemName);
      }
      break;

    case "estimate_time":
      if (params.origin && params.destination) {
        metadata.routeType = categorizeRoute(params.origin, params.destination);
      }
      break;

    // 添加其他工具的元数据...
  }

  return {
    complexityScore,
    queryType,
    shouldCache,
    expiryDays,
    initialConfidence,
    cacheTier,
    isRealtime,
    metadata,
  };
}

/**
 * 生成查询指纹 - 唯一标识一个查询
 */
export function generateQueryFingerprint(
  toolName: string,
  params: any
): string {
  // 标准化参数对象
  const normalizedParams = normalizeParameters(toolName, params);

  // 串联工具名和参数
  const signature = toolName + "|" + JSON.stringify(normalizedParams);

  // 生成指纹
  return crypto.createHash("sha256").update(signature).digest("hex");
}

/**
 * 标准化参数对象 - 确保相同查询产生相同指纹
 */
function normalizeParameters(toolName: string, params: any): any {
  if (!params) return {};

  // 创建深拷贝
  const normalized = JSON.parse(JSON.stringify(params));

  // 移除非相关字段
  delete normalized._queryTime;
  delete normalized._contextId;
  delete normalized._sessionId;

  // 工具特定处理
  switch (toolName) {
    case "find_item":
      if (normalized.itemName) {
        normalized.itemName = normalized.itemName.toLowerCase().trim();
      }
      break;

    case "estimate_time":
      if (normalized.origin) {
        normalized.origin = normalized.origin.toLowerCase().trim();
      }
      if (normalized.destination) {
        normalized.destination = normalized.destination.toLowerCase().trim();
      }
      break;

    // 其他工具特定处理...
  }

  return normalized;
}

/**
 * 分类物品类别 - 从旧代码保留但简化
 */
export function categorizeItem(itemName: string): string {
  if (!itemName) return "MISC";

  const name = itemName.toLowerCase().trim();

  if (/证|证件|身份|护照/.test(name)) return "DOCUMENT";
  if (/钱|钱包|银行卡/.test(name)) return "VALUABLE";
  if (/钥匙|门卡|门禁/.test(name)) return "KEY";
  if (/手机|电脑|笔记本|平板/.test(name)) return "ELECTRONICS";
  if (/书|笔|钢笔|文具/.test(name)) return "STATIONERY";
  if (/衣|裤|袜|鞋|帽/.test(name)) return "CLOTHING";
  if (/药|医|治疗/.test(name)) return "MEDICINE";
  if (/包|书包|袋|箱|盒/.test(name)) return "CONTAINER";
  if (/食品|食物|零食|饮料/.test(name)) return "FOOD";

  return "MISC";
}

/**
 * 分类路线类型 - 从旧代码保留但简化
 */
export function categorizeRoute(origin: string, destination: string): string {
  const combined = (origin + " " + destination).toLowerCase();

  if (/学院|大学|学校|教学楼|宿舍/.test(combined)) return "CAMPUS";
  if (/商场|超市|购物|商店/.test(combined)) return "SHOPPING";
  if (/公司|单位|工作|办公/.test(combined)) return "COMMUTE";

  return "GENERAL";
}

/**
 * 计算参数相似度 - 从旧代码优化
 */
export function calculateParameterSimilarity(
  params1: any,
  params2: any
): number {
  // 基本类型比较
  if (typeof params1 !== typeof params2) return 0;
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

    const maxLen = Math.max(params1.length, params2.length);
    let matchCount = 0;

    for (let i = 0; i < Math.min(params1.length, params2.length); i++) {
      matchCount += calculateParameterSimilarity(params1[i], params2[i]);
    }

    return matchCount / maxLen;
  }

  // 对象类型
  const keys1 = Object.keys(params1);
  const keys2 = Object.keys(params2);

  if (keys1.length === 0 && keys2.length === 0) return 1;
  if (keys1.length === 0 || keys2.length === 0) return 0;

  const allKeys = new Set([...keys1, ...keys2]);
  let totalScore = 0;

  for (const key of allKeys) {
    if (key in params1 && key in params2) {
      totalScore += calculateParameterSimilarity(params1[key], params2[key]);
    }
  }

  return totalScore / allKeys.size;
}

/**
 * 计算字符串相似度 - 优化版本
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  // 标准化
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // 完全匹配
  if (s1 === s2) return 1.0;

  // 空字符串
  if (s1.length === 0 || s2.length === 0) return 0;

  // 计算编辑距离
  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  return 1 - distance / maxLen;
}

/**
 * 计算Levenshtein距离
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

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

// 在 memoryUtils.ts 中添加兼容函数
export function isImportantData(toolName: string, params: any): boolean {
  // 使用新的 analyzeQuery 来判断
  const analysis = analyzeQuery(toolName, params);
  
  // 如果不应该缓存，则视为"重要数据"
  return !analysis.shouldCache;
}