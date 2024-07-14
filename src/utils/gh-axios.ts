import axios from 'axios';

export function createGithubClient(ghPat: string) {
    return axios.create({
        baseURL: 'https://api.github.com',
        headers: {
            'Authorization': `Bearer ${ghPat}`,
            'Accept': 'application/vnd.github+json', // Essential
            'X-GitHub-Api-Version': '2022-11-28' // Essential
        },
    });
};