import { Executor } from "../../pg";

import { v4 as uuid } from 'uuid';

export type GhConfig = {
    id?: number;
    userID?: string;
    ghRepoName: string;
    ghUserName?: string;
    ghPat: string;
};

export async function createGhConfig(
    executor: Executor,
    config: GhConfig
): Promise<{ success: boolean; message: string; config?: GhConfig }> {
    const { userID, ghRepoName, ghPat, ghUserName } = config;

    // Check if the GitHub configuration already exists for the user
    const { rows } = await executor(
        `select 1 from gh_config where userid = $1`,
        [userID]
    );

    if (rows.length > 0) {
        return { success: false, message: 'GitHub configuration already exists for this user' };
    }

    const result = await executor(
        `insert into gh_config (id, userid, gh_repo_name, gh_pat, gh_username, lastmodified) values ($1, $2, $3, $4, $5, now()) returning *`,
        [uuid(), userID, ghRepoName, ghPat, ghUserName]
    );

    const newConfig = result.rows[0];

    return { success: true, message: 'GitHub configuration created successfully', config: newConfig };
}

export async function getGhConfigByUserId(
    executor: Executor,
    userID: string
): Promise<{ success: boolean; config?: GhConfig; message?: string }> {
    const { rows } = await executor(
        `select * from gh_config where userid = $1`,
        [userID]
    );

    if (rows.length === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    return { success: true, config: rows[0] };
}

export async function updateGhConfig(
    executor: Executor,
    config: GhConfig
): Promise<{ success: boolean; message: string }> {
    const { userID, ghRepoName, ghPat } = config;

    const { rowCount } = await executor(
        `update gh_config set gh_repo_name = $1, gh_pat = $2, lastmodified = now() where userid = $3`,
        [ghRepoName, ghPat, userID]
    );

    if (rowCount === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    return { success: true, message: 'GitHub configuration updated successfully' };
}

export async function deleteGhConfig(
    executor: Executor,
    userID: string
): Promise<{ success: boolean; message: string }> {
    const { rowCount } = await executor(
        `delete from gh_config where userid = $1`,
        [userID]
    );

    if (rowCount === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    return { success: true, message: 'GitHub configuration deleted successfully' };
}