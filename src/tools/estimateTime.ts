import { Db } from "mongodb";
import { LocationsModel } from "../model/locations.js";
import { TravelTimeEstimationResponse } from "../model/types.js";
import { analyzeQuery } from "../utils/memoryUtils.js";
import { memoryManager } from "../model/memory.js";

/**
 * 出行时间估算工具
 */
export class EstimateTimeTool {
  private locationsModel: LocationsModel;
  private db: Db;

  constructor(db: Db) {
    this.locationsModel = new LocationsModel(db);
    this.db = db;
  }

  /**
   * 执行时间估算
   * @param params 估算参数
   * @returns 估算结果
   */
  async execute(params: {
    origin: string;
    destination: string;
    _contextId?: string; // 新增：上下文ID
  }): Promise<{
    success: boolean;
    estimation?: TravelTimeEstimationResponse;
    message?: string;
    _fromMemory?: boolean; // 新增：标记结果来源
    _memoryId?: string; // 新增：记忆ID
  }> {
    try {
      const { origin, destination, _contextId } = params;

      // 验证参数
      if (!origin || !destination) {
        return {
          success: false,
          message: "必须提供起点和终点",
        };
      }

      // 分析查询复杂度
      const analysis = analyzeQuery("estimate_time", params);

      // 如果复杂度足够，尝试从记忆获取
      if (analysis.complexityScore >= 3 && analysis.shouldCache) {
        try {
          const memory = memoryManager(this.db);
          const result = await memory.findMemory("estimate_time", params, {
            contextId: _contextId,
            confidenceThreshold: 0.7,
          });

          if (result) {
            // 从记忆中获取结果
            return {
              ...result.result.data,
              _fromMemory: true,
              _memoryId: result._id.toString(),
            };
          }
        } catch (error) {
          console.error("从记忆获取时间估算时出错:", error);
          // 错误不中断流程
        }
      }

      // 执行实际估算
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

      const result = {
        success: true,
        estimation,
        message: `从${estimation.origin.name}到${estimation.destination.name}预计需要${estimation.estimatedTime}${estimation.unit}`,
      } as {
        success: boolean;
        estimation?: TravelTimeEstimationResponse;
        message?: string;
        _fromMemory?: boolean;
        _memoryId?: string;
      };

      // 如果复杂度足够，存储记忆
      if (analysis.complexityScore >= 3 && analysis.shouldCache) {
        try {
          const memory = memoryManager(this.db);

          // 提取依赖实体
          const dependencies = [];

          if (estimation.origin.id) {
            dependencies.push({
              entityType: "location",
              entityId: estimation.origin.id,
              relationship: "primary",
            });
          }

          if (estimation.destination.id) {
            dependencies.push({
              entityType: "location",
              entityId: estimation.destination.id,
              relationship: "primary",
            });
          }

          // 存储记忆
          const newMemory = await memory.storeMemory(
            "estimate_time",
            params,
            result,
            {
              contextId: _contextId,
              dependencies,
            }
          );

          if (newMemory) {
            result._memoryId = newMemory._id.toString();
          }
        } catch (error) {
          console.error("存储时间估算记忆时出错:", error);
          // 错误不中断流程
        }
      }

      return result;
    } catch (error) {
      console.error("估算时间时出错:", error);
      return {
        success: false,
        message: `估算时间时出错: ${error}`,
      };
    }
  }

  /**
   * 格式化响应
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
