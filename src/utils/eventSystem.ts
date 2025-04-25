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
  // 物品移动规则
  "item.transferred": (event: EntityChangeEvent) => ({
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

  // 物品更新规则
  "item.updated": (event: EntityChangeEvent) => ({
    query: {
      entityDependencies: {
        $elemMatch: {
          entityType: "item",
          entityId: event.entityId,
        },
      },
    },
    action: "reduce_confidence",
  }),

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
      },
    });
    return result.modifiedCount;
  } else if (action === "reduce_confidence") {
    // 降低置信度
    const result = await memoryCollection.updateMany(query, {
      $mul: { "resultInfo.confidence": 0.5 },
    });
    return result.modifiedCount;
  }

  return 0;
}
