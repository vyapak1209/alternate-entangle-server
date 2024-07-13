import { transact } from '../pg';
import { updateGhConfig } from '../services/github-sync/gh-config'; // Assuming updateGhConfig is defined in ghConfig service

import type Express from 'express';

export async function handleUpdateGhConfig(req: Express.Request, res: Express.Response) {
    const { userID, ghRepoName, ghPat } = req.body;

    try {
        const result = await transact(async executor => {
            const config = { userID, ghRepoName, ghPat };
            return await updateGhConfig(executor, config);
        });
        res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: "Oops! Something went wrong while updating GitHub configuration" });
    }
}