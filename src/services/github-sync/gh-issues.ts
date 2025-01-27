import { Executor } from '../../pg.js';
import { TodoUpdate } from '../../entities/index.js';
import { createGithubClient } from '../../utils/gh-axios.js';

import { v4 as uuid } from 'uuid';

export type GhIssue = {
    id?: string;
    todoId: string;
    githubIssueId: number;
};

export async function createGhIssue(
    executor: Executor,
    todo: TodoUpdate,
    userID: string
): Promise<{ success: boolean; message: string; issue?: GhIssue }> {
    const { id: todoId, title, description } = todo;

    const { rows: listRows } = await executor(
        `select ownerid from list where id = $1`,
        [todo.listID]
    );

    if (listRows[0].ownerid === userID) {
        // Creator of todo is the owner of the list
    }

    // Doing this to ensure there is no inconsistency in todo x issue if a collaborator
    // updates/deletes/creates a todo
    const { rows: configRows } = await executor(
        `select gh_repo_name, gh_pat, gh_username from gh_config where userid = $1`,
        [listRows[0].ownerid]
    );

    if (configRows.length === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    const { gh_repo_name, gh_pat, gh_username } = configRows[0];
    const githubClient = createGithubClient(gh_pat);

    try {
        const response = await githubClient.post(`/repos/${gh_username}/${gh_repo_name}/issues`, {
            title,
            body: description
        });

        const githubIssueId = response.data.number;

        const result = await executor(
            `insert into gh_issues (id, todoid, ghid, lastmodified) values ($1, $2, $3, now()) returning *`,
            [uuid(), todoId, githubIssueId]
        );

        const newIssue = result.rows[0];

        return { success: true, message: 'GitHub issue created successfully', issue: newIssue };
    } catch (error) {
        console.log('error in gh', error);

        return { success: false, message: `Error while creating github issue` };
    }
}

export async function getGhIssueByTodoId(
    executor: Executor,
    todoId: string
): Promise<{ success: boolean; issue?: GhIssue; message?: string }> {
    const { rows } = await executor(
        `select * from gh_issues where todoid = $1`,
        [todoId]
    );

    if (rows.length === 0) {
        return { success: false, message: 'GitHub issue not found for this todo' };
    }

    return { success: true, issue: rows[0] };
}

export async function updateGhIssue(
    executor: Executor,
    todo: TodoUpdate,
    userID: string
): Promise<{ success: boolean; message: string }> {
    const { id: todoId, title, description } = todo;

    const { rows: listRows } = await executor(
        `select ownerid from list where id = $1`,
        [todo.listID]
    );

    if (listRows[0].ownerid === userID) {
        // Creator of todo is the owner of the list
    }

    // Doing this to ensure there is no inconsistency in todo x issue if a collaborator
    // updates/deletes/creates a todo
    const { rows: configRows } = await executor(
        `select gh_repo_name, gh_pat, gh_username from gh_config where userid = $1`,
        [listRows[0].ownerid]
    );

    if (configRows.length === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    const { gh_repo_name, gh_pat, gh_username } = configRows[0];
    const githubClient = createGithubClient(gh_pat);

    const { rows: issueRows } = await executor(
        `select ghid from gh_issues where todoid = $1`,
        [todoId]
    );

    if (issueRows.length === 0) {
        return { success: false, message: 'GitHub issue not found for this todo' };
    }

    const githubIssueId = issueRows[0].ghid;

    try {
        await githubClient.patch(`/repos/${gh_username}/${gh_repo_name}/issues/${githubIssueId}`, {
            title,
            body: description,
            state: todo.status === "DONE" ? 'closed' : 'open'
        });

        await executor(
            `update gh_issues set lastmodified = now() where todoid = $1`,
            [todoId]
        );

        return { success: true, message: 'GitHub issue updated successfully' };
    } catch (error) {
        return { success: false, message: `Error while updating github issue` };
    }
}

export async function deleteGhIssue(
    executor: Executor,
    todoId: string,
    userID: string
): Promise<{ success: boolean; message: string }> {

    const { rows: todoRows } = await executor(
        `select listid from item where id = $1`,
        [todoId]
    )

    const { rows: listRows } = await executor(
        `select ownerid from list where id = $1`,
        [todoRows[0].listid]
    );

    // Doing this to ensure there is no inconsistency in todo x issue if a collaborator
    // updates/deletes/creates a todo
    const { rows: configRows } = await executor(
        `select gh_repo_name, gh_pat, gh_username from gh_config where userid = $1`,
        [listRows[0].ownerid]
    );

    if (configRows.length === 0) {
        return { success: false, message: 'GitHub configuration not found for this user' };
    }

    const { gh_repo_name, gh_pat, gh_username } = configRows[0];

    if (listRows[0].ownerid === userID) {
        // Creator of todo is the owner of the list
    }

    // Get the GitHub issue ID for the todo
    const { rows: issueRows } = await executor(
        `select ghid from gh_issues where todoid = $1`,
        [todoId]
    );

    if (issueRows.length === 0) {
        return { success: false, message: 'GitHub issue not found for this todo' };
    }

    const githubIssueId = issueRows[0].ghid;

    const githubClient = createGithubClient(gh_pat);

    try {
        await githubClient.patch(`/repos/${gh_username}/${gh_repo_name}/issues/${githubIssueId}`, {
            state: 'closed',
        });

        await executor(
            `delete from gh_issues where todoid = $1`,
            [todoId]
        );

        return { success: true, message: 'GitHub issue deleted successfully' };
    } catch (error) {
        return { success: false, message: `Error while deleting github issue` };
    }
}