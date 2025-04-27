// src/tools/deleteBioData.ts
import { ObjectId, Db } from "mongodb";
import { BioDataModel } from "../model/bioData.js";

/**
 * 生物数据删除工具
 * 用于删除系统中的测量记录
 */
export class DeleteBioDataTool {
  private bioDataModel: BioDataModel;

  constructor(db: Db) {
    this.bioDataModel = new BioDataModel(db);
  }

  /**
   * 执行生物数据删除
   * @param params 删除参数
   * @returns 删除结果
   */
  async execute(params: {
    recordId?: string;
    measurementType?: string;
    recordName?: string;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { recordId, measurementType, recordName } = params;

      // 验证参数 - 需要提供记录ID或(测量类型+记录名称)
      if (!recordId && !(measurementType && recordName)) {
        return {
          success: false,
          message: "必须提供记录ID或(测量类型+记录名称)",
        };
      }

      // 解析记录ID
      let resolvedRecordId = recordId;
      if (!resolvedRecordId && measurementType && recordName) {
        // 通过测量类型和记录名称查找记录
        const records = await this.bioDataModel["bioDataCollection"]
          .find({
            measurementType: new RegExp(measurementType, "i"),
            recordName: new RegExp(recordName, "i"),
          })
          .toArray();

        if (records.length === 0) {
          return {
            success: false,
            message: `未找到类型为"${measurementType}"，名称为"${recordName}"的记录`,
          };
        }

        // 使用第一个匹配项
        resolvedRecordId = records[0]._id.toString();
      }

      // 查询记录详情，用于返回消息
      const record = await this.bioDataModel.getRecordById(
        new ObjectId(resolvedRecordId!)
      );
      if (!record) {
        return {
          success: false,
          message: `未找到ID为"${resolvedRecordId}"的记录`,
        };
      }

      // 执行删除
      const result = await this.bioDataModel.deleteRecord(resolvedRecordId!);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      const successMessage = `成功删除"${record.measurementType}"测量记录: ${
        record.value
      } ${record.unit || ""}`;

      return {
        success: true,
        message: successMessage,
      };
    } catch (error) {
      console.error("删除生物数据时出错:", error);
      return {
        success: false,
        message: `删除生物数据时出错: ${error}`,
      };
    }
  }
}
