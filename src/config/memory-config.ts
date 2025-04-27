/**
 * 记忆系统配置
 * 集中管理记忆系统的所有参数
 */
export const memoryConfig = {
  /**
   * 是否启用记忆系统
   */
  enabled: true,

  /**
   * 置信度阈值配置
   */
  confidenceThresholds: {
    // 查找记忆时的最低置信度要求
    findMemory: 0.8,
    // 高置信度下限
    highConfidence: 0.8,
    // 中等置信度下限
    mediumConfidence: 0.5,
    // 低置信度下限
    lowConfidence: 0.3,
  },

  /**
   * 过期时间配置（单位：天）
   */
  expiryTimes: {
    // 短期记忆过期时间
    shortTerm: 3,
    // 中期记忆过期时间
    midTerm: 14,
    // 长期记忆过期时间（null表示不过期）
    longTerm: null,
  },

  /**
   * 工具特定配置
   */
  toolSettings: {
    // 物品查找工具
    find_item: {
      // 默认存储层级
      defaultTier: "mid_term",
      // 初始置信度
      initialConfidence: 0.9,
      // 是否启用记忆
      enableMemory: true,
    },
    // 时间估算工具
    estimate_time: {
      defaultTier: "long_term",
      initialConfidence: 0.7,
      enableMemory: true,
    },
    // 物品查询工具
    query_item: {
      defaultTier: "mid_term",
      initialConfidence: 0.95,
      enableMemory: true,
    },
    // 位置查询工具
    query_location: {
      defaultTier: "long_term",
      initialConfidence: 0.95,
      enableMemory: true,
    },
    // 联系人查询工具
    query_contact: {
      defaultTier: "long_term",
      initialConfidence: 0.95,
      enableMemory: true,
    },
    // 生物数据查询工具
    query_biodata: {
      defaultTier: "mid_term",
      initialConfidence: 0.85,
      enableMemory: true,
    },
    // 任务查询工具
    query_task: {
      defaultTier: "short_term",
      initialConfidence: 0.8,
      enableMemory: true,
    },
    // 最新生物数据工具
    get_latest_biodata: {
      defaultTier: "short_term",
      initialConfidence: 0.85,
      enableMemory: false, // 实时数据，不缓存
    },
    // 待办任务工具
    get_pending_tasks: {
      defaultTier: "short_term",
      initialConfidence: 0.7,
      enableMemory: false, // 实时数据，不缓存
    },
  },

  /**
   * 物品类别特定配置
   */
  categorySettings: {
    // 证件类
    DOCUMENT: {
      enableMemory: false, // 跳过缓存
      defaultTier: "short_term",
      initialConfidence: 0.8,
    },
    // 贵重物品类
    VALUABLE: {
      enableMemory: false, // 跳过缓存
      defaultTier: "short_term",
      initialConfidence: 0.8,
    },
    // 钥匙类
    KEY: {
      enableMemory: false, // 跳过缓存
      defaultTier: "short_term",
      initialConfidence: 0.8,
    },
    // 电子设备类
    ELECTRONICS: {
      enableMemory: false, // 跳过缓存
      defaultTier: "short_term",
      initialConfidence: 0.9,
    },
    // 文具类
    STATIONERY: {
      enableMemory: true,
      defaultTier: "mid_term",
      initialConfidence: 0.9,
    },
    // 衣物类
    CLOTHING: {
      enableMemory: true,
      defaultTier: "mid_term",
      initialConfidence: 0.9,
    },
    // 药品类
    MEDICINE: {
      enableMemory: true,
      defaultTier: "mid_term",
      initialConfidence: 0.9,
    },
    // 容器类
    CONTAINER: {
      enableMemory: true,
      defaultTier: "long_term",
      initialConfidence: 0.95,
    },
    // 食品类
    FOOD: {
      enableMemory: true,
      defaultTier: "short_term",
      initialConfidence: 0.8,
    },
    // 未分类
    MISC: {
      enableMemory: true,
      defaultTier: "mid_term",
      initialConfidence: 0.8,
    },
  },

  /**
   * 记忆清理配置
   */
  cleanup: {
    // 清理过期记忆的间隔（毫秒）
    expiredInterval: 3600000, // 1小时
    // 清理旧记忆的间隔（毫秒）
    oldInterval: 86400000, // 24小时
    // 更新统计信息的间隔（毫秒）
    statsInterval: 300000, // 5分钟
    // 旧记忆的判定阈值（天）
    oldThreshold: 30,
    // 低置信度的判定阈值
    lowConfidenceThreshold: 0.3,
  },
};

/**
 * 获取工具的配置
 * @param toolName 工具名称
 * @returns 工具配置
 */
export function getToolConfig(toolName: string): any {
  return (
    memoryConfig.toolSettings[toolName] || {
      defaultTier: "mid_term",
      initialConfidence: 0.8,
      enableMemory: true,
    }
  );
}

/**
 * 获取物品类别的配置
 * @param category 物品类别
 * @returns 类别配置
 */
export function getCategoryConfig(category: string): any {
  return (
    memoryConfig.categorySettings[category] ||
    memoryConfig.categorySettings["MISC"]
  );
}

/**
 * 获取置信度阈值
 * @param type 阈值类型
 * @returns 置信度阈值
 */
export function getConfidenceThreshold(
  type: "findMemory" | "highConfidence" | "mediumConfidence" | "lowConfidence"
): number {
  return memoryConfig.confidenceThresholds[type];
}

/**
 * 获取过期时间（天）
 * @param tier 存储层级
 * @returns 过期时间（天数或null）
 */
export function getExpiryDays(
  tier: "shortTerm" | "midTerm" | "longTerm"
): number | null {
  return memoryConfig.expiryTimes[tier];
}

/**
 * 检查记忆系统是否启用
 * @returns 是否启用
 */
export function isMemoryEnabled(): boolean {
  return memoryConfig.enabled;
}

/**
 * 检查工具是否启用记忆
 * @param toolName 工具名称
 * @returns 是否启用记忆
 */
export function isToolMemoryEnabled(toolName: string): boolean {
  const toolConfig = getToolConfig(toolName);
  return memoryConfig.enabled && toolConfig.enableMemory;
}

/**
 * 检查物品类别是否启用记忆
 * @param category 物品类别
 * @returns 是否启用记忆
 */
export function isCategoryMemoryEnabled(category: string): boolean {
  const categoryConfig = getCategoryConfig(category);
  return memoryConfig.enabled && categoryConfig.enableMemory;
}
