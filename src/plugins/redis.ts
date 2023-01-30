import { Snowflake } from "discord-api-types/v9";
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import RedisClient, { Redis } from "ioredis";

import { StoredStateResponse } from "../authRoutes";
import { MessageSavedInCache } from "../lib/messages/cache";

type ArgType = Array<string | number>;
class RedisCache {
  private _client: Redis;
  constructor(host: string, port: number) {
    this._client = new RedisClient(port, host);
  }

  private async _sendCommand(command: string, args: ArgType): Promise<unknown> {
    //this.logger.debug(`Sending redis command: ${command} with args: ${args}`);
    const data = await this._client.call(command, ...args);
    //this.logger.debug(
    //  `Received data: ${data} from redis command: ${command} with args ${args}`
    //);
    return data;
  }
  private async _get({
    key,
    path = ".",
  }: {
    key: string;
    path?: string | string[];
  }): Promise<unknown> {
    let args = [key];
    if (typeof path === "string") {
      args.push(path);
    } else {
      args = args.concat(path);
    }
    return await this._sendCommand("JSON.GET", args);
  }
  private _set({
    key,
    path = ".",
    value,
  }: {
    key: string;
    path?: string;
    value: string;
  }): Promise<void> {
    return this._sendCommand("JSON.SET", [key, path, value]) as Promise<void>;
  }

  private _delete({
    key,
    path = ".",
  }: {
    key: string;
    path?: string;
  }): Promise<number> {
    return this._sendCommand("JSON.DEL", [key, path]) as Promise<number>;
  }
  private _setExpiry({
    key,
    expiry,
  }: {
    key: string;
    expiry: number;
  }): Promise<void> {
    return this._sendCommand("PEXPIRE", [key, expiry]) as Promise<void>;
  }
  async _getExpiry(key: string): Promise<number | null> {
    const ttl = (await this._sendCommand("PTTL", [key])) as number;
    if (ttl < 0) {
      return null;
    }
    return ttl;
  }

  async setState(state: string, redirectPath: string | null): Promise<void> {
    const key = `state:${state}`;
    await this._set({
      key,
      value: JSON.stringify(redirectPath),
    });
    // One hour expiry
    await this._setExpiry({ key, expiry: 1000 * 60 * 60 });
  }
  async getState(state: string): Promise<StoredStateResponse | undefined> {
    const data = await this._get({ key: `state:${state}` });
    // We do not know what the data is, so we use falsy values
    // Also an empty string should be returned as undefined anyways
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (data) {
      return { redirectPath: JSON.parse(data as string) as string };
    }
    return undefined;
  }
  deleteState(state: string): Promise<number> {
    return this._delete({ key: `state:${state}` });
  }

  async setMessageCache(
    key: string,
    message: MessageSavedInCache
  ): Promise<void> {
    key = `message:${key}`;
    // TTL of one day
    await this._set({ key, value: JSON.stringify(message) });
    await this._setExpiry({ key, expiry: 1000 * 60 * 60 * 24 });
  }
  async getMessageCache(key: string): Promise<MessageSavedInCache | null> {
    const data = await this._get({ key: `message:${key}` });

    // We do not know what the data is, so we use falsy values
    // Also an empty string should be returned as undefined anyways
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (data) {
      return JSON.parse(data as string) as MessageSavedInCache;
    }
    return null;
  }
  async deleteMessageCache(key: string): Promise<number> {
    return this._delete({ key: `message:${key}` });
  }
  async setSession(session: string, userId: Snowflake): Promise<void> {
    const key = `session:${session}`;
    await this._set({ key, value: JSON.stringify(userId) });
    await this._setExpiry({
      key,
      expiry: 1000 * 60 * 60 * 24 * 7,
    });
  }
  async getSession(
    session: string
  ): Promise<{ userId: Snowflake; expiry: number } | null> {
    const userId = JSON.parse(
      (await this._get({ key: `session:${session}` })) as string
    ) as Snowflake | null;
    if (userId === null) {
      return null;
    }
    return {
      userId,
      expiry: (await this._getExpiry(`session:${session}`)) as number,
    };
  }

  async getOauthCache(path: string, userId: Snowflake): Promise<unknown> {
    return JSON.parse(
      (await this._get({ key: `oauth:${path}:${userId}` })) as string
    ) as unknown;
  }
  async setOauthCache(
    path: string,
    userId: Snowflake,
    data: unknown,
    expiry: number = 1000 * 60 * 3
  ): Promise<void> {
    await this._set({
      key: `oauth:${path}:${userId}`,
      value: JSON.stringify(data),
    });
    await this._setExpiry({ key: `oauth:${path}:${userId}`, expiry });
  }

  async deleteSession(session: string): Promise<number> {
    return this._delete({ key: `session:${session}` });
  }

  async setGuildMigrationCommandRegistered(guildId: Snowflake) {
    await this._sendCommand("SET", [
      `${guildId}:migrationCmdRegistered`,
      "true",
      "EX",
      60 * 60,
    ]); // 1 hour
  }
  async getGuildMigrationCommandRegistered(
    guildId: Snowflake
  ): Promise<boolean> {
    const registered = (await this._sendCommand("GET", [
      `${guildId}:migrationCmdRegistered`,
    ])) as string | undefined | null;
    return registered === "true";
  }

  // User avatar hashes - store for a long time as they are used by many - but also don't keep them forever
  async setUserData(
    userId: Snowflake,
    data: { avatar: string | null; username: string; discriminator: string }
  ): Promise<void> {
    await this._sendCommand("SET", [
      `user:${userId}:data`,
      JSON.stringify(data),
      "EX",
      60 * 60 * 24 * 7 * 3,
    ]); // 3 weeks
  }
  async getUserData(userId: Snowflake): Promise<{
    avatar: string | null;
    username: string;
    discriminator: string;
  } | null> {
    const data = (await this._sendCommand("GET", [
      `user:${userId}:data`,
    ])) as string;
    if (data === "null") {
      return null;
    }
    return JSON.parse(data) as {
      avatar: string | null;
      username: string;
      discriminator: string;
    } | null;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    redisCache: RedisCache;
  }
}

interface RedisPluginOptions extends FastifyPluginOptions {
  redis?: {
    host?: string;
    port?: number;
  };
}

const redisRestPlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (server: FastifyInstance, options?: RedisPluginOptions) => {
    if (
      options?.redis?.port === undefined ||
      options?.redis?.host === undefined
    ) {
      throw new Error("Host or port not set");
    }
    server.log.info(
      `Connecting to redis general cache at ${options.redis.host}:${options.redis.port}`
    );
    const redisClient = new RedisCache(options.redis.host, options.redis.port);

    server.decorate("redisCache", redisClient);
  }
);

export default redisRestPlugin;

export { RedisCache };
