import { Db } from "mongodb";
import { BioDataModel } from "../model/bioData.js";
import { BioData } from "../model/types.js";

/**
 * 生物数据创建工具
 * 用于添加新的测量记录到系统
 */
export class CreateBioDataTool {
  private bioDataModel: BioDataModel;

  constructor(db: Db) {
    this.bioDataModel = new BioDataModel(db);
  }

  /**
   * 执行生物数据创建
   * @param params 创建参数
   * @returns 创建结果
   */
  async execute(params: {
    measurementType: string;
    value: number;
    unit?: string;
    recordName?: string;
    context?: string;
    notes?: string;
    measuredAt?: string;
  }): Promise<{
    success: boolean;
    record?: BioData;
    message?: string;
    error?: string;
  }> {
    try {
      const {
        measurementType,
        value,
        unit,
        recordName,
        context,
        notes,
        measuredAt,
      } = params;

      // 验证参数
      if (!measurementType) {
        return {
          success: false,
          message: "必须提供测量类型",
        };
      }

      if (value === undefined || value === null) {
        return {
          success: false,
          message: "必须提供测量值",
        };
      }

      // 准备生物数据
      const bioDataParams: Partial<BioData> = {
        measurementType,
        value,
        unit,
        recordName,
        context,
        notes,
      };

      // 处理测量时间
      if (measuredAt) {
        bioDataParams.measuredAt = new Date(measuredAt);
      }

      // 创建生物数据
      const result = await this.bioDataModel.addMeasurement(bioDataParams);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      // 构建成功消息
      let successMessage = `成功添加"${measurementType}"测量记录: ${value}`;

      if (unit) {
        successMessage += ` ${unit}`;
      }

      if (context) {
        successMessage += `，情境: "${context}"`;
      }

      if (measuredAt) {
        const date = new Date(measuredAt);
        successMessage += `，测量时间: ${date.toLocaleString()}`;
      }

      return {
        success: true,
        record: result.record,
        message: successMessage,
      };
    } catch (error) {
      console.error("创建生物数据时出错:", error);
      return {
        success: false,
        message: `创建生物数据时出错: ${error}`,
      };
    }
  }
}
