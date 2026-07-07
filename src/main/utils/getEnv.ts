import path from "path";
import { appManager } from "../app";
import { secretsManager } from "../app/secrets";
import { app } from "electron";
import { RequestContext } from "@mastra/core/context";
import { providersManager } from "../providers";

export const getEnv = async (requestContext?: RequestContext<Record<string, any>>) => {
  const secretsEnv = await secretsManager.getSecretsEnv();
  const appInfo = await appManager.getInfo();
  let env: Record<string, string> = {};
  env = { ...secretsEnv };
  if (appInfo.apiServer.enabled) {
    env['AIME_CHAT_API_BASE_URL'] = `http://localhost:${appInfo.apiServer.port}`;
  }
  env['AIME_CHAT_SKILL_PATH'] = path.join(app.getPath('userData'), 'skills');
  let modelId = requestContext?.get('model' as never) as string || appInfo.defaultModel.model;
  if (modelId) {
    const provider = await providersManager.getProvider(modelId);
    if (provider &&
      provider.provider?.isActive) {
      env['OPENAI_API_KEY'] = provider.provider.apiKey;
      env['OPENAI_BASE_URL'] = provider.provider.apiBase;
    }
    // const modelInfo = await providersManager.getModelInfo(modelId);

  }
  return env;
};
