import express, { Request, Response } from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
    const {} = req.body;
    res.send('Hello, TypeScript Express!');
});

app.get('/health', (req: Request, res: Response) => {
    const {} = req.body;
    res.status(200).send('Healthy');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
