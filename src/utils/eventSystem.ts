// src/utils/eventSystem.ts - 简化版本，作为兼容层
import { EntityEvent } from "../model/memory.js";
import { ObjectId } from "mongodb";

// 为了兼容性保留的函数
export async function processEntityEvent(
  event: {
    entityType: string;
    entityId: ObjectId;
    eventType: EntityEvent;
    timestamp: Date;
    details?: any;
  },
  memoryCollection: any
): Promise<number> {
  console.warn("使用已弃用的processEntityEvent，请更新代码");

  // 我们这里不做实际操作，只返回0
  // 实际处理会在新的MemoryModel兼容层中完成
  return 0;
}
