import { MemoryModel, EntityEvent } from "../src/model/memory.js";
import { MongoClient, ObjectId } from "mongodb";

async function testMemorySystem() {
  // 连接到MongoDB
  const client = new MongoClient("mongodb://localhost:27017");
  await client.connect();
  const db = client.db("vitea_test");

  // 创建MemoryModel实例
  const memoryModel = new MemoryModel(db);

  // 测试1: 存储和检索
  console.log("测试1: 存储和检索");

  // 存储记忆
  const memory1 = await memoryModel.storeMemory(
    "find_item",
    { itemName: "测试物品", exactMatch: false },
    { found: true, items: [{ itemName: "测试物品" }] }
  );

  console.log("存储记忆成功:", memory1._id);

  // 查找记忆
  const foundMemory = await memoryModel.findMemory("find_item", {
    itemName: "测试物品",
    exactMatch: false,
  });

  console.log("查找记忆:", foundMemory ? "成功" : "失败");

  // 测试2: 不同类别物品
  console.log("\n测试2: 不同类别物品");

  // 存储第二个记忆
  await memoryModel.storeMemory(
    "find_item",
    { itemName: "身份证", exactMatch: false },
    { found: true, items: [{ itemName: "身份证" }] }
  );

  // 尝试用"钥匙"查找"身份证"
  const shouldNotFind = await memoryModel.findMemory("find_item", {
    itemName: "钥匙",
    exactMatch: false,
  });

  console.log(
    "查找不同类别物品:",
    shouldNotFind ? "错误地找到了" : "正确地没找到"
  );

  // 测试3: 事件系统
  console.log("\n测试3: 事件系统");

  // 触发实体更新事件
  const affectedCount = await memoryModel.processEntityEvent({
    entityType: "item",
    entityId: new ObjectId(),
    eventType: EntityEvent.UPDATED,
    timestamp: new Date(),
  });

  console.log("事件处理影响记录数:", affectedCount);

  // 关闭连接
  await client.close();
  console.log("\n测试完成");
}

testMemorySystem().catch(console.error);
