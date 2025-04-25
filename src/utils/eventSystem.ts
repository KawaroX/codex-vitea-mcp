// src/utils/eventSystem.ts
import { EntityChangeEvent, EntityEvent } from "../model/memory.js";
import { ObjectId } from "mongodb";

/**
 * 过期规则类型定义
 */
export type ExpirationRule = (event: EntityChangeEvent) => {
  query: any;
  action: "expire" | "reduce_confidence";
};

/**
 * 过期规则集
 */
export const expirationRules: Record<string, ExpirationRule> = {
  // 物品移动规则 - 降低置信度而非直接过期
  "item.transferred": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "item",
          entityId: event.entityId,
        },
      },
      // 只影响位置相关的记忆
      "resultInfo.tags": { $in: ["item_location"] }
    },
    action: "reduce_confidence",
  }),

  // 物品更新规则 - 根据变更类型处理
  "item.updated": (event: EntityChangeEvent) => {
    const isStatusChange = event.details?.statusChanged;
    const isLocationChange = event.details?.locationChanged;
    
    // 状态变更直接使记忆过期
    if (isStatusChange) {
      return {
        query: {
          entityDependencies: {
            $elemMatch: {
              entityType: "item",
              entityId: event.entityId,
            },
          },
        },
        action: "expire",
      };
    }
    
    // 位置变更降低置信度
    if (isLocationChange) {
      return {
        query: {
          entityDependencies: {
            $elemMatch: {
              entityType: "item",
              entityId: event.entityId,
            },
          },
          "resultInfo.tags": { $in: ["item_location"] }
        },
        action: "reduce_confidence",
      };
    }

    // 默认处理 - 降低置信度
    return {
      query: {
        entityDependencies: {
          $elemMatch: {
            entityType: "item",
            entityId: event.entityId,
          },
        },
      },
      action: "reduce_confidence",
    };
  },

  // 物品删除规则
  "item.deleted": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "item",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 位置更新规则
  "location.updated": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "location",
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),

  // 位置删除规则
  "location.deleted": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "location",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 任务状态变更规则
  "task.statusChanged": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "task",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 任务更新规则
  "task.updated": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "task",
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),

  // 任务删除规则
  "task.deleted": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "task",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 联系人更新规则
  "contact.updated": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "contact",
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),

  // 联系人删除规则
  "contact.deleted": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "contact",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 生物数据更新规则
  "biodata.updated": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "biodata",
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),

  // 生物数据删除规则
  "biodata.deleted": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "biodata",
          entityId: event.entityId,
        },
      },
    },
    action: "expire",
  }),

  // 通用笔记添加规则
  "*.noteAdded": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: event.entityType,
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),
};

/**
 * 处理实体变更事件
 * @param event 事件对象
 * @param memoryCollection MongoDB 集合对象
 * @returns 修改的文档数量
 */
export async function processEntityEvent(
  event: EntityChangeEvent,
  memoryCollection: any
): Promise<number> {
  try {
    // 1. 确定适用的规则
    const specificRuleKey = `${event.entityType}.${event.eventType}`;
    const genericRuleKey = `*.${event.eventType}`;

    let rule = expirationRules[specificRuleKey];

    if (!rule) {
      rule = expirationRules[genericRuleKey];
    }

    if (!rule) {
      return 0; // 无匹配规则
    }

    // 2. 应用规则，获取查询条件和动作
    const { query, action } = rule(event);

    // 3. 执行相应动作
    if (action === "expire") {
      // 立即使匹配的 Memory 过期
      const result = await memoryCollection.updateMany(query, {
        $set: {
          "classification.expiresAt": new Date(),
          "resultInfo.confidence": 0,
          lastModified: new Date(),
        },
      });
      return result.modifiedCount;
    } else if (action === "reduce_confidence") {
      // 降低置信度到0.5（而不是乘以0.5）
      const result = await memoryCollection.updateMany(query, {
        $set: {
          "resultInfo.confidence": 0.5,
          lastModified: new Date(),
        },
      });
      return result.modifiedCount;
    }

    return 0;
  } catch (error) {
    console.error(`处理实体事件失败: ${error}`);
    return 0;
  }
}
