import crypto from "crypto";
import { analyzeQuery, generateQueryFingerprint } from "./memoryUtils.js";

// 查询步骤记录
export interface QueryStep {
  id: string;
  timestamp: Date;
  toolName: string;
  params: any;
  result: any;
  fingerprint: string;
  complexity: number;
  previousStepId?: string;
  relationToPrevious?: string;
}

// 查询上下文
export interface QueryContext {
  contextId: string;
  steps: QueryStep[];
  createdAt: Date;
  lastActivity: Date;
  complexity: number;
  isCompleted: boolean;
}

// 上下文管理器
export class ContextManager {
  private contexts: Map<string, QueryContext> = new Map();
  private maxContextAge: number = 30 * 60 * 1000; // 30分钟
  private maxContexts: number = 100;

  /**
   * 创建新上下文
   */
  createContext(): string {
    // 清理过期上下文
    this.cleanup();

    // 生成上下文ID
    const contextId = crypto.randomUUID();

    // 创建上下文
    this.contexts.set(contextId, {
      contextId,
      steps: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      complexity: 0,
      isCompleted: false,
    });

    return contextId;
  }

  /**
   * 获取上下文
   */
  getContext(contextId: string): QueryContext | null {
    if (!this.contexts.has(contextId)) {
      return null;
    }

    return this.contexts.get(contextId)!;
  }

  /**
   * 添加查询步骤
   */
  addQueryStep(
    contextId: string,
    toolName: string,
    params: any,
    result: any
  ): QueryStep | null {
    // 检查上下文是否存在
    if (!this.contexts.has(contextId)) {
      return null;
    }

    // 获取上下文
    const context = this.contexts.get(contextId)!;

    // 生成查询指纹
    const fingerprint = generateQueryFingerprint(toolName, params);

    // 分析查询复杂度
    const analysis = analyzeQuery(toolName, params);

    // 创建查询步骤
    const step: QueryStep = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      toolName,
      params,
      result,
      fingerprint,
      complexity: analysis.complexityScore,
    };

    // 更新步骤之间的关系
    if (context.steps.length > 0) {
      // 获取上一步
      const previousStep = context.steps[context.steps.length - 1];
      
      // 添加步骤关系标记
      step.previousStepId = previousStep.id;
      
      // 尝试发现步骤间的语义关联
      const relation = this.detectStepRelation(previousStep, step);
      if (relation) {
        step.relationToPrevious = relation;
      }
    }

    // 添加步骤到上下文
    context.steps.push(step);

    // 更新上下文
    context.lastActivity = new Date();
    context.complexity += analysis.complexityScore;

    // 保存上下文
    this.contexts.set(contextId, context);

    return step;
  }

  /**
   * 检测步骤之间的关系
   */
  private detectStepRelation(previous: QueryStep, current: QueryStep): string | null {
    // 实体传递关系
    if (previous.result && previous.result.entityId && 
        current.params && (current.params.entityId === previous.result.entityId)) {
      return "entity_transfer";
    }
    
    // 位置传递关系
    if (previous.toolName === "query_location" && current.toolName === "estimate_time" &&
        previous.result && previous.result.location && current.params && 
        (current.params.origin === previous.result.location.name)) {
      return "location_transfer";
    }
    
    // 其他关系类型检测...
    
    return null;
  }

  /**
   * 检查上下文是否为复合查询
   */
  isCompoundQuery(contextId: string): boolean {
    // 检查上下文是否存在
    if (!this.contexts.has(contextId)) {
      return false;
    }

    // 获取上下文
    const context = this.contexts.get(contextId)!;

    // 单步骤查询不是复合查询
    if (context.steps.length <= 1) {
      return false;
    }

    // 检查总复杂度
    return context.complexity >= 6;
  }

  /**
   * 完成上下文
   */
  completeContext(contextId: string): boolean {
    // 检查上下文是否存在
    if (!this.contexts.has(contextId)) {
      return false;
    }

    // 获取上下文
    const context = this.contexts.get(contextId)!;

    // 标记为已完成
    context.isCompleted = true;

    // 保存上下文
    this.contexts.set(contextId, context);

    return true;
  }

  /**
   * 获取所有上下文
   */
  getAllContexts(): QueryContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * 清理过期上下文
   */
  cleanup(): void {
    const now = new Date();
    const expiredIds: string[] = [];

    // 找出过期上下文
    for (const [id, context] of this.contexts.entries()) {
      if (now.getTime() - context.lastActivity.getTime() > this.maxContextAge) {
        expiredIds.push(id);
      }
    }

    // 删除过期上下文
    for (const id of expiredIds) {
      this.contexts.delete(id);
    }

    // 如果上下文数量超过最大值，删除最老的上下文
    if (this.contexts.size > this.maxContexts) {
      const sortedContexts = Array.from(this.contexts.entries()).sort(
        (a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime()
      );

      const toRemove = sortedContexts.slice(
        0,
        this.contexts.size - this.maxContexts
      );

      for (const [id] of toRemove) {
        this.contexts.delete(id);
      }
    }
  }
}

// 创建单例实例
export const contextManager = new ContextManager();
