import { ObjectId, MongoClient } from "mongodb";
import { memoryManager } from "../model/memory.js";
import { contextManager } from "../utils/ContextManager.js";
import { analyzeQuery } from "../utils/memoryUtils.js";

/**
 * 新Memory系统测试
 */
async function testNewMemorySystem() {
  console.log("开始测试新Memory系统");

  // 连接MongoDB
  const client = new MongoClient(
    "mongodb+srv://wkawaro:UVjtLG2XX1unXgMJ@cluster0.mz3hgeu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  );
  await client.connect();
  const db = client.db("vitea_test");

  // 清空测试集合
  await db.collection("memories").deleteMany({});

  // 创建Memory管理器
  const memory = memoryManager(db);

  // 测试1: 基本存储和检索
  console.log("\n1. 测试基本存储和检索");

  // 参数分析
  const testParams = { itemName: "测试物品", exactMatch: false };
  const analysis = analyzeQuery("find_item", testParams);
  console.log("查询复杂度分析:", analysis);

  // 存储记忆
  const testResult = { found: true, items: [{ itemName: "测试物品" }] };

  try {
    const newMemory = await memory.storeMemory(
      "find_item",
      testParams,
      testResult
    );
    console.log("存储记忆成功:", newMemory._id);

    // 检索记忆 - 简单查询不应该从记忆中检索
    const foundMemory = await memory.findMemory("find_item", testParams);

    if (foundMemory) {
      console.log("查找记忆成功:", foundMemory._id);
      console.log("置信度:", foundMemory.result.confidence);
    } else {
      console.log("查找记忆失败 - 这是预期的，因为复杂度不足");
    }

    // 使用上下文ID进行检索 - 这应该允许低复杂度查询被检索
    const contextId = contextManager.createContext();
    const foundWithContext = await memory.findMemory("find_item", testParams, {
      contextId,
    });

    if (foundWithContext) {
      console.log("通过上下文查找记忆成功:", foundWithContext._id);
    } else {
      console.log("通过上下文查找记忆失败");
    }
  } catch (error) {
    console.error("测试1失败:", error);
  }

  // 测试2: 复杂度区分
  console.log("\n2. 测试复杂度区分");

  // 低复杂度查询
  const simpleParams = { itemName: "笔", exactMatch: true };
  const simpleAnalysis = analyzeQuery("find_item", simpleParams);
  console.log("简单查询复杂度:", simpleAnalysis.complexityScore);
  console.log("应该缓存:", simpleAnalysis.shouldCache);

  // 高复杂度查询
  const complexParams = {
    origin: "北京大学",
    destination: "清华大学",
    mode: "walking",
  };
  const complexAnalysis = analyzeQuery("estimate_time", complexParams);
  console.log("复杂查询复杂度:", complexAnalysis.complexityScore);
  console.log("应该缓存:", complexAnalysis.shouldCache);

  // 存储复杂查询
  try {
    const complexResult = {
      success: true,
      estimation: {
        estimatedTime: 20,
        unit: "分钟",
        origin: { name: "北京大学" },
        destination: { name: "清华大学" },
      },
    };

    const complexMemory = await memory.storeMemory(
      "estimate_time",
      complexParams,
      complexResult
    );
    console.log("存储复杂查询成功:", complexMemory._id);

    // 检索复杂查询
    const foundComplex = await memory.findMemory(
      "estimate_time",
      complexParams
    );

    if (foundComplex) {
      console.log("查找复杂查询成功:", foundComplex._id);
    } else {
      console.log("查找复杂查询失败 - 应该成功，因为复杂度足够");
    }

    // 测试相似查询
    const similarParams = {
      origin: "北京大学",
      destination: "清华大学",
      mode: "cycling", // 变化了一点
    };

    const foundSimilar = await memory.findMemory(
      "estimate_time",
      similarParams
    );

    if (foundSimilar) {
      console.log("查找相似查询成功:", foundSimilar._id);
      console.log("查询相似度评估:", foundSimilar._similarityScore || "未记录");
    } else {
      console.log("查找相似查询失败 - 改进的匹配逻辑应该找到相似查询");
    }
  } catch (error) {
    console.error("测试2失败:", error);
  }

  // 测试3: 上下文管理
  console.log("\n3. 测试上下文管理");

  // 创建上下文
  const contextId = contextManager.createContext();
  console.log("创建上下文:", contextId);

  // 添加查询步骤
  const step1 = contextManager.addQueryStep(
    contextId,
    "query_contact",
    { search: "王小明" },
    { success: true, contacts: [{ name: "王小明", phone: "12345678901" }] }
  );

  const step2 = contextManager.addQueryStep(
    contextId,
    "query_contact",
    { contactId: "abc123" },
    { success: true, contact: { name: "王小明", school: "北京大学" } }
  );

  const step3 = contextManager.addQueryStep(
    contextId,
    "estimate_time",
    { origin: "北京大学", destination: "清华大学" },
    { success: true, estimation: { estimatedTime: 20, unit: "分钟" } }
  );

  console.log(
    "上下文步骤数:",
    contextManager.getContext(contextId)?.steps.length
  );
  console.log("是否为复合查询:", contextManager.isCompoundQuery(contextId));

  // 测试4: 创建复合记忆
  console.log("\n4. 测试创建复合记忆 - 改进版");

  try {
    // 从上下文提取步骤
    const context = contextManager.getContext(contextId);
    if (context) {
      const steps = context.steps.map((step) => ({
        toolName: step.toolName,
        params: step.params,
        result: step.result,
      }));

      // 创建复合记忆
      const compoundMemory = await memory.storeCompoundMemory(contextId, steps);

      if (compoundMemory) {
        console.log("创建复合记忆成功:", compoundMemory._id);
        console.log("复合记忆复杂度:", compoundMemory.query.complexityScore);
        console.log("复合记忆层级:", compoundMemory.storage.tier);

        // 测试复合记忆检索
        // 创建一个新上下文
        const similarContext = contextManager.createContext();

        // 添加类似的第一步
        contextManager.addQueryStep(
          similarContext,
          "query_contact",
          { search: "王小明" }, // 相同的第一步
          { success: true, contacts: [{ name: "王小明" }] }
        );

        // 尝试检索
        const foundCompound = await memory.findMemory(
          "query_contact",
          { search: "王小明" },
          { contextId: similarContext }
        );

        if (foundCompound) {
          console.log("成功找到相关复合记忆:", foundCompound._id);
          console.log("是否为复合记忆:", foundCompound.query.isCompound);
        } else {
          console.log(
            "未找到相关复合记忆 - 改进的匹配逻辑应该找到相关复合记忆"
          );
        }
      } else {
        console.log("创建复合记忆失败");
      }
    }
  } catch (error) {
    console.error("测试4失败:", error);
  }

  // 测试5: 记忆统计信息
  console.log("\n5. 测试记忆统计信息");

  try {
    const stats = await memory.getMemoryStats();
    console.log("记忆统计信息:", stats);
  } catch (error) {
    console.error("测试5失败:", error);
  }

  // 测试6: 测试实体更新对记忆的影响
  console.log("\n6. 测试实体更新对记忆的影响");

  try {
    // 生成随机ObjectId
    const validObjectId = Array.from({length: 24}, () => 
      Math.floor(Math.random() * 16).toString(16)).join('');

    // 先创建一个与实体相关的记忆
    const entityRelatedMemory = await memory.storeMemory(
      "find_item",
      { itemName: "实体测试物品" },
      { found: true, items: [{ itemName: "实体测试物品", itemId: validObjectId }] },
      {
        dependencies: [
          {
            entityType: "item",
            entityId: new ObjectId(validObjectId),
            relationship: "primary",
          },
        ],
      }
    );

    console.log("创建实体相关记忆:", entityRelatedMemory._id);

    // 模拟实体更新
    const updatedCount = await memory.handleEntityUpdate(
      "item",
      validObjectId,
      "updated"
    );

    console.log(`实体更新影响了${updatedCount}条记忆`);

    // 检查记忆状态
    const memoryAfterUpdate = await memory.findMemoryById(
      entityRelatedMemory._id
    );

    if (memoryAfterUpdate) {
      console.log("更新后的记忆置信度:", memoryAfterUpdate.result.confidence);
      console.log(
        "是否与预期一致 (应该降低):",
        memoryAfterUpdate.result.confidence <
          entityRelatedMemory.result.confidence
      );
    } else {
      console.log("未找到更新后的记忆");
    }
  } catch (error) {
    console.error("测试6失败:", error);
  }

  // 关闭连接
  await client.close();
  console.log("\n测试完成");
}

// 执行测试
testNewMemorySystem().catch(console.error);
