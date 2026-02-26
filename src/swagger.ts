import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../package.json';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.1.0',
        info: {
            title: 'Linkerine Feed API',
            version,
            description:
                'Proxy API that fetches, parses, and normalises RSS/Atom feeds into a consistent JSON schema.',
            contact: {
                name: 'Linkerine',
                url: 'https://linkerine.netlify.app',
            },
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT ?? 3001}`,
                description: 'Local development server',
            },
            {
                url: 'https://linkerine.netlify.app',
                description: 'Production server',
            },
        ],
        components: {
            schemas: {
                DiscoveredFeed: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', format: 'uri', example: 'https://blog.sharafat.xyz/index.xml' },
                        title: { type: 'string', example: 'Sharafat Karim | Blog' },
                        type: { type: 'string', example: 'application/rss+xml' },
                        source: {
                            type: 'string',
                            enum: ['html-link', 'probe'],
                            description: '`html-link` = found in <link rel="alternate">; `probe` = discovered by path guessing.',
                        },
                    },
                    required: ['url', 'title', 'type', 'source'],
                },
                DiscoverResponse: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', format: 'uri', description: 'The URL that was inspected.' },
                        feeds: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/DiscoveredFeed' },
                        },
                    },
                    required: ['url', 'feeds'],
                },
                Article: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique identifier – the article link, or title as fallback.',
                            example: 'https://blog.example.com/my-post',
                        },
                        title: {
                            type: 'string',
                            example: 'My Awesome Post',
                        },
                        link: {
                            type: 'string',
                            format: 'uri',
                            example: 'https://blog.example.com/my-post',
                        },
                        pubDate: {
                            type: 'string',
                            format: 'date-time',
                            example: '2024-06-01T12:00:00.000Z',
                        },
                        contentSnippet: {
                            type: 'string',
                            description: 'First 300 characters of the article content.',
                            example: 'Lorem ipsum dolor sit amet...',
                        },
                        content: {
                            type: 'string',
                            description: 'Full HTML content of the article.',
                        },
                    },
                    required: ['id', 'title', 'link', 'pubDate', 'contentSnippet', 'content'],
                },
                FeedResponse: {
                    type: 'object',
                    properties: {
                        feedTitle: {
                            type: 'string',
                            description: 'Title of the feed.',
                            example: 'Sharafat Karim | Blog',
                        },
                        articles: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Article' },
                        },
                    },
                    required: ['feedTitle', 'articles'],
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            example: 'Missing feed URL parameter',
                        },
                    },
                    required: ['error'],
                },
                HealthResponse: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'ok' },
                        ts: { type: 'string', format: 'date-time', example: '2024-06-01T12:00:00.000Z' },
                    },
                    required: ['status', 'ts'],
                },
            },
        },
    },
    apis: ['./src/routes/*.ts', './src/index.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
