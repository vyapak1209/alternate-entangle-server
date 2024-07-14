import { Executor } from "../../pg.js";
import { GhConfig, createGhConfig } from "../github-sync/gh-config.js";

import { v4 as uuid } from 'uuid';

export type User = {
    userID?: string,
    username: string,
    passkey: number
}

export type UpdateUserRequest = Omit<User, "username">;

export async function createUser(
    executor: Executor,
    user: User,
    ghConfig?: GhConfig
): Promise<{ success: boolean; message: string; user?: User }> {
    const { username, passkey } = user;

    const { rows } = await executor(
        `select 1 from entangle_user where username = $1`,
        [username]
    );

    if (rows.length > 0) {
        return { success: false, message: 'User already exists' };
    }

    const newUserID = uuid();

    await executor(
        `insert into entangle_user (id, username, passkey, lastmodified) values ($1, $2, $3, now())`,
        [newUserID, username, passkey]
    );

    if (ghConfig) {
        ghConfig.userID = newUserID;
        ghConfig.ghUserName = username;
        const ghConfigResult = await createGhConfig(executor, ghConfig);
        if (!ghConfigResult.success) {
            return { success: false, message: 'User created but GitHub configuration failed: ' + ghConfigResult.message };
        }
    }

    return {
        success: true,
        message: 'User created successfully',
        user: {
            userID: newUserID,
            username,
            passkey
        }
    };
}


export async function loginUser(
    executor: Executor,
    username: string,
    passkey: number
): Promise<{ success: boolean; user?: User; message?: string }> {
    const { rows } = await executor(
        `select id as "userID", username from entangle_user where username = $1 and passkey = $2`,
        [username, passkey]
    );

    if (rows.length === 0) {
        return { success: false, message: 'Invalid username or passkey' };
    }

    return { success: true, user: rows[0] };
}