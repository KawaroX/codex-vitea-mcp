import { Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";
import { TravelTimeEstimationResponse } from "../model/types.js";

/**
 * 出行时间估算工具
 * 用于估算从一个地点到另一个地点所需的时间
 */
export class EstimateTimeTool {
  private locationsModel: LocationsModel;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
  }

  /**
   * 执行时间估算
   * @param params 估算参数
   * @returns 估算结果
   */
  async execute(params: { origin: string; destination: string }): Promise<{
    success: boolean;
    estimation?: TravelTimeEstimationResponse;
    message?: string;
  }> {
    try {
      const { origin, destination } = params;

      // 验证参数
      if (!origin || !destination) {
        return {
          success: false,
          message: "必须提供起点和终点",
        };
      }

      // 估算时间
      const estimation = await this.locationsModel.estimateTravelTime(
        origin,
        destination
      );

      if (!estimation) {
        return {
          success: false,
          message: `无法估算从"${origin}"到"${destination}"的时间`,
        };
      }

      return {
        success: true,
        estimation,
      };
    } catch (error) {
      console.error("估算时间时出错:", error);
      return {
        success: false,
        message: `估算时间时出错: ${error}`,
      };
    }
  }

  /**
   * 格式化响应为易读文本
   * @param result 估算结果
   * @returns 易读格式的结果描述
   */
  formatResponse(result: {
    success: boolean;
    estimation?: TravelTimeEstimationResponse;
    message?: string;
  }): string {
    if (!result.success || !result.estimation) {
      return result.message || "无法估算时间";
    }

    const { estimation } = result;
    let response = `从${estimation.origin.name}到${estimation.destination.name}`;

    if (estimation.context) {
      response += `（${estimation.context}）`;
    }

    response += `预计需要约${estimation.estimatedTime}${estimation.unit}`;

    if (estimation.baseSpeed && estimation.speedUnit) {
      response += `\n基于行走速度：${estimation.baseSpeed}${estimation.speedUnit}`;
    }

    if (estimation.notes) {
      response += `\n备注：${estimation.notes}`;
    }

    return response;
  }
}
