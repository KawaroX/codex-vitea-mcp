import { type Collection, ObjectId, type Db } from "mongodb";
import { BioData, ensureObjectId } from "./types.js";
import { MemoryModel, EntityEvent } from "./memory.js";

/**
 * 生物数据操作类
 */
export class BioDataModel {
  private bioDataCollection: Collection<BioData>;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
    this.bioDataCollection = db.collection<BioData>("bioData");
  }

  /**
   * 获取最新的测量记录
   * @param measurementType 测量类型
   * @returns 最新的测量记录
   */
  async getLatestMeasurement(measurementType: string): Promise<BioData | null> {
    return await this.bioDataCollection.findOne(
      { measurementType: new RegExp(measurementType, "i") },
      { sort: { measuredAt: -1 } }
    );
  }

  /**
   * 获取特定类型的所有测量记录
   * @param measurementType 测量类型
   * @param limit 限制返回记录数量
   * @returns 测量记录列表
   */
  async getMeasurementHistory(
    measurementType: string,
    limit: number = 10
  ): Promise<BioData[]> {
    return await this.bioDataCollection
      .find({ measurementType: new RegExp(measurementType, "i") })
      .sort({ measuredAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * 添加新的测量记录
   * @param data 测量数据
   * @returns 操作结果
   */
  async addMeasurement(data: Partial<BioData>): Promise<{
    success: boolean;
    record?: BioData;
    error?: string;
  }> {
    try {
      // 如果没有记录名称，自动生成一个
      if (!data.recordName) {
        data.recordName = `${data.measurementType}-${
          new Date().toISOString().split("T")[0]
        }`;
      }

      // 设置测量时间为当前时间（如果未提供）
      if (!data.measuredAt) {
        data.measuredAt = new Date();
      }

      // 添加通用字段
      const newRecord: Partial<BioData> = {
        ...data,
        isLatest: true,
        syncedToNotion: false,
        modifiedSinceSync: true,
        lastSync: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 将之前的同类型记录标记为非最新
      await this.bioDataCollection.updateMany(
        { measurementType: data.measurementType, isLatest: true },
        { $set: { isLatest: false, updatedAt: new Date() } }
      );

      // 插入新记录
      const result = await this.bioDataCollection.insertOne(newRecord as any);

      if (!result.acknowledged) {
        return { success: false, error: "添加测量记录失败" };
      }

      // 查询插入的记录
      const insertedRecord = await this.bioDataCollection.findOne({
        _id: result.insertedId,
      });

      const addResult = {
        success: true,
        record: insertedRecord || undefined,
      };

      // 生成生物数据添加事件用于更新 Memory
      try {
        const event = {
          entityType: "biodata",
          entityId: result.insertedId,
          eventType: EntityEvent.CREATED,
          timestamp: new Date(),
          details: {
            measurementType: data.measurementType,
            value: data.value,
            unit: data.unit,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return addResult;
    } catch (error) {
      return {
        success: false,
        error: `添加测量记录失败: ${error}`,
      };
    }
  }

  /**
   * 删除测量记录
   * @param recordId 记录ID
   * @returns 操作结果
   */
  async deleteRecord(recordId: string | ObjectId): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const id = ensureObjectId(recordId);

      // 获取要删除的记录
      const record = await this.getRecordById(id);

      if (!record) {
        return { success: false, error: "未找到测量记录" };
      }

      // 删除记录
      const result = await this.bioDataCollection.deleteOne({ _id: id });

      if (result.deletedCount === 0) {
        return { success: false, error: "删除测量记录失败" };
      }

      // 如果删除的是最新记录，更新同类型的上一条记录为最新
      if (record.isLatest) {
        const previousRecord = await this.bioDataCollection
          .find({
            measurementType: record.measurementType,
            _id: { $ne: id },
          })
          .sort({ measuredAt: -1 })
          .limit(1)
          .toArray();

        if (previousRecord.length > 0) {
          await this.bioDataCollection.updateOne(
            { _id: previousRecord[0]._id },
            { $set: { isLatest: true, updatedAt: new Date() } }
          );
        }
      }

      // 生成生物数据删除事件用于更新 Memory
      try {
        const event = {
          entityType: "biodata",
          entityId: id,
          eventType: EntityEvent.DELETED,
          timestamp: new Date(),
          details: {
            measurementType: record.measurementType,
            recordName: record.recordName,
          },
        };

        // 发布事件
        const memoryManager = new MemoryModel(this.db);
        await memoryManager.processEntityEvent(event);
      } catch (eventError) {
        console.error("处理 Memory 事件失败:", eventError);
        // 事件处理失败不影响主流程
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `删除测量记录失败: ${error}`,
      };
    }
  }

  /**
   * 根据ID查询测量记录
   * @param recordId 记录ID
   * @returns 测量记录
   */
  async getRecordById(recordId: ObjectId): Promise<BioData | null> {
    const id = ensureObjectId(recordId);
    return await this.bioDataCollection.findOne({ _id: id });
  }

  /**
   * 搜索测量记录
   * @param query 查询条件
   * @param limit 限制返回记录数量
   * @returns 匹配的测量记录
   */
  async searchRecords(query: string, limit: number = 10): Promise<BioData[]> {
    const searchRegex = new RegExp(query, "i");

    return await this.bioDataCollection
      .find({
        $or: [
          { recordName: searchRegex },
          { measurementType: searchRegex },
          { unit: searchRegex },
          { context: searchRegex },
          { notes: searchRegex },
        ],
      })
      .sort({ measuredAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * 获取所有测量类型
   * @returns 唯一的测量类型列表
   */
  async getAllMeasurementTypes(): Promise<string[]> {
    const result = await this.bioDataCollection
      .aggregate([
        { $group: { _id: "$measurementType" } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return result.map((item) => item._id);
  }

  /**
   * 获取特定时间段内的测量记录
   * @param measurementType 测量类型
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @returns 时间段内的测量记录
   */
  async getMeasurementsByDateRange(
    measurementType: string,
    startDate: Date,
    endDate: Date
  ): Promise<BioData[]> {
    return await this.bioDataCollection
      .find({
        measurementType: new RegExp(measurementType, "i"),
        measuredAt: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ measuredAt: 1 })
      .toArray();
  }

  /**
   * 计算测量数据统计信息
   * @param measurementType 测量类型
   * @returns 统计信息（平均值、最小值、最大值等）
   */
  async getMeasurementStats(measurementType: string): Promise<{
    count: number;
    average: number;
    min: number;
    max: number;
    unit?: string;
    latest?: BioData;
  }> {
    const stats = await this.bioDataCollection
      .aggregate([
        { $match: { measurementType: new RegExp(measurementType, "i") } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            average: { $avg: "$value" },
            min: { $min: "$value" },
            max: { $max: "$value" },
            units: { $addToSet: "$unit" },
          },
        },
      ])
      .toArray();

    // 获取最新记录
    const latest = await this.getLatestMeasurement(measurementType);

    if (stats.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        latest: latest || undefined,
      };
    }

    return {
      count: stats[0].count,
      average: Math.round(stats[0].average * 100) / 100, // 四舍五入到2位小数
      min: stats[0].min,
      max: stats[0].max,
      unit: stats[0].units[0], // 使用最常见的单位
      latest: latest || undefined,
    };
  }
}
