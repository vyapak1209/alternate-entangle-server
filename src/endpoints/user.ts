import { transact } from '../pg';
import {
    createUser,
    loginUser
} from '../services/user/user';

import type Express from 'express';

export async function handleCreateUser(req: Express.Request, res: Express.Response) {
    const { user, ghConfig } = req.body;

    try {
        const result = await transact(async executor => {
            return await createUser(executor, user, ghConfig);
        });
        res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: "Oops! Something went wrong while creating user" });
    }
}

export async function handleLoginUser(req: Express.Request, res: Express.Response) {
    const { username, passkey } = req.body;

    try {
        const result = await transact(async executor => {
            return await loginUser(executor, username, passkey);
        });
        res.status(result.success ? 200 : 401).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: "Oops! Something went wrong while logging in" });
    }
}