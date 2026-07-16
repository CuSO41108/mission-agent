// Integration Service · 接口适配器业务层
// 单表操作，Service 层目前只是 Repository 的薄包装
// 后续接真实邮件/飞书接口时，业务逻辑会加到这里

import { IntegrationRepository } from "../repositories/integrationRepository";
import type { IntegrationAdapter } from "../../renderer/types";

export function getAllIntegrations(): IntegrationAdapter[] {
  return IntegrationRepository.list();
}

export function getIntegrationById(id: string): IntegrationAdapter | null {
  return IntegrationRepository.findById(id);
}
