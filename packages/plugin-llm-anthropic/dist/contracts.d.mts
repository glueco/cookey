import { z } from 'zod';

declare const ChatMessageSchema: z.ZodObject<{
    role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
    content: z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        text: z.ZodOptional<z.ZodString>;
        image_url: z.ZodOptional<z.ZodObject<{
            url: z.ZodString;
            detail: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            url: string;
            detail?: string | undefined;
        }, {
            url: string;
            detail?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        text?: string | undefined;
        image_url?: {
            url: string;
            detail?: string | undefined;
        } | undefined;
    }, {
        type: string;
        text?: string | undefined;
        image_url?: {
            url: string;
            detail?: string | undefined;
        } | undefined;
    }>, "many">]>>;
    name: z.ZodOptional<z.ZodString>;
    tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"function">;
        function: z.ZodObject<{
            name: z.ZodString;
            arguments: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            arguments: string;
        }, {
            name: string;
            arguments: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }, {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }>, "many">>;
    tool_call_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant" | "tool" | "system";
    content: string | {
        type: string;
        text?: string | undefined;
        image_url?: {
            url: string;
            detail?: string | undefined;
        } | undefined;
    }[] | null;
    name?: string | undefined;
    tool_calls?: {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }[] | undefined;
    tool_call_id?: string | undefined;
}, {
    role: "user" | "assistant" | "tool" | "system";
    content: string | {
        type: string;
        text?: string | undefined;
        image_url?: {
            url: string;
            detail?: string | undefined;
        } | undefined;
    }[] | null;
    name?: string | undefined;
    tool_calls?: {
        function: {
            name: string;
            arguments: string;
        };
        type: "function";
        id: string;
    }[] | undefined;
    tool_call_id?: string | undefined;
}>;
type ChatMessage = z.infer<typeof ChatMessageSchema>;
declare const ChatCompletionRequestSchema: z.ZodObject<{
    model: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
        content: z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            text: z.ZodOptional<z.ZodString>;
            image_url: z.ZodOptional<z.ZodObject<{
                url: z.ZodString;
                detail: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                url: string;
                detail?: string | undefined;
            }, {
                url: string;
                detail?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }, {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }>, "many">]>>;
        name: z.ZodOptional<z.ZodString>;
        tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"function">;
            function: z.ZodObject<{
                name: z.ZodString;
                arguments: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                arguments: string;
            }, {
                name: string;
                arguments: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }, {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }>, "many">>;
        tool_call_id: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "assistant" | "tool" | "system";
        content: string | {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }[] | null;
        name?: string | undefined;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
        tool_call_id?: string | undefined;
    }, {
        role: "user" | "assistant" | "tool" | "system";
        content: string | {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }[] | null;
        name?: string | undefined;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
        tool_call_id?: string | undefined;
    }>, "many">;
    temperature: z.ZodOptional<z.ZodNumber>;
    top_p: z.ZodOptional<z.ZodNumber>;
    top_k: z.ZodOptional<z.ZodNumber>;
    stream: z.ZodOptional<z.ZodBoolean>;
    stop: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    max_tokens: z.ZodOptional<z.ZodNumber>;
    max_completion_tokens: z.ZodOptional<z.ZodNumber>;
    tools: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"function">;
        function: z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        }, {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        function: {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        };
        type: "function";
    }, {
        function: {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        };
        type: "function";
    }>, "many">>;
    tool_choice: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"none">, z.ZodLiteral<"auto">, z.ZodLiteral<"required">, z.ZodObject<{
        type: z.ZodLiteral<"function">;
        function: z.ZodObject<{
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
        }, {
            name: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        function: {
            name: string;
        };
        type: "function";
    }, {
        function: {
            name: string;
        };
        type: "function";
    }>]>>;
}, "strip", z.ZodTypeAny, {
    model: string;
    messages: {
        role: "user" | "assistant" | "tool" | "system";
        content: string | {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }[] | null;
        name?: string | undefined;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
        tool_call_id?: string | undefined;
    }[];
    temperature?: number | undefined;
    top_p?: number | undefined;
    top_k?: number | undefined;
    stream?: boolean | undefined;
    stop?: string | string[] | undefined;
    max_tokens?: number | undefined;
    max_completion_tokens?: number | undefined;
    tools?: {
        function: {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        };
        type: "function";
    }[] | undefined;
    tool_choice?: "auto" | "none" | "required" | {
        function: {
            name: string;
        };
        type: "function";
    } | undefined;
}, {
    model: string;
    messages: {
        role: "user" | "assistant" | "tool" | "system";
        content: string | {
            type: string;
            text?: string | undefined;
            image_url?: {
                url: string;
                detail?: string | undefined;
            } | undefined;
        }[] | null;
        name?: string | undefined;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
        tool_call_id?: string | undefined;
    }[];
    temperature?: number | undefined;
    top_p?: number | undefined;
    top_k?: number | undefined;
    stream?: boolean | undefined;
    stop?: string | string[] | undefined;
    max_tokens?: number | undefined;
    max_completion_tokens?: number | undefined;
    tools?: {
        function: {
            name: string;
            description?: string | undefined;
            parameters?: Record<string, unknown> | undefined;
        };
        type: "function";
    }[] | undefined;
    tool_choice?: "auto" | "none" | "required" | {
        function: {
            name: string;
        };
        type: "function";
    } | undefined;
}>;
type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
declare const ChatCompletionChoiceSchema: z.ZodObject<{
    index: z.ZodNumber;
    message: z.ZodObject<{
        role: z.ZodLiteral<"assistant">;
        content: z.ZodNullable<z.ZodString>;
        tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"function">;
            function: z.ZodObject<{
                name: z.ZodString;
                arguments: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                arguments: string;
            }, {
                name: string;
                arguments: string;
            }>;
        }, "strip", z.ZodTypeAny, {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }, {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        role: "assistant";
        content: string | null;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
    }, {
        role: "assistant";
        content: string | null;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
    }>;
    finish_reason: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: {
        role: "assistant";
        content: string | null;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
    };
    index: number;
    finish_reason: string | null;
}, {
    message: {
        role: "assistant";
        content: string | null;
        tool_calls?: {
            function: {
                name: string;
                arguments: string;
            };
            type: "function";
            id: string;
        }[] | undefined;
    };
    index: number;
    finish_reason: string | null;
}>;
type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>;
declare const UsageSchema: z.ZodObject<{
    prompt_tokens: z.ZodNumber;
    completion_tokens: z.ZodNumber;
    total_tokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}, {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}>;
type Usage = z.infer<typeof UsageSchema>;
declare const ChatCompletionResponseSchema: z.ZodObject<{
    id: z.ZodString;
    object: z.ZodLiteral<"chat.completion">;
    created: z.ZodNumber;
    model: z.ZodString;
    choices: z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        message: z.ZodObject<{
            role: z.ZodLiteral<"assistant">;
            content: z.ZodNullable<z.ZodString>;
            tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"function">;
                function: z.ZodObject<{
                    name: z.ZodString;
                    arguments: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    name: string;
                    arguments: string;
                }, {
                    name: string;
                    arguments: string;
                }>;
            }, "strip", z.ZodTypeAny, {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }, {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        }, {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        }>;
        finish_reason: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message: {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        };
        index: number;
        finish_reason: string | null;
    }, {
        message: {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        };
        index: number;
        finish_reason: string | null;
    }>, "many">;
    usage: z.ZodOptional<z.ZodObject<{
        prompt_tokens: z.ZodNumber;
        completion_tokens: z.ZodNumber;
        total_tokens: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }, {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    object: "chat.completion";
    model: string;
    id: string;
    created: number;
    choices: {
        message: {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        };
        index: number;
        finish_reason: string | null;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    } | undefined;
}, {
    object: "chat.completion";
    model: string;
    id: string;
    created: number;
    choices: {
        message: {
            role: "assistant";
            content: string | null;
            tool_calls?: {
                function: {
                    name: string;
                    arguments: string;
                };
                type: "function";
                id: string;
            }[] | undefined;
        };
        index: number;
        finish_reason: string | null;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    } | undefined;
}>;
type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
declare const ChatCompletionChunkSchema: z.ZodObject<{
    id: z.ZodString;
    object: z.ZodLiteral<"chat.completion.chunk">;
    created: z.ZodNumber;
    model: z.ZodString;
    choices: z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        delta: z.ZodObject<{
            role: z.ZodOptional<z.ZodString>;
            content: z.ZodOptional<z.ZodString>;
            tool_calls: z.ZodOptional<z.ZodArray<z.ZodObject<{
                index: z.ZodNumber;
                id: z.ZodOptional<z.ZodString>;
                type: z.ZodOptional<z.ZodLiteral<"function">>;
                function: z.ZodOptional<z.ZodObject<{
                    name: z.ZodOptional<z.ZodString>;
                    arguments: z.ZodOptional<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    name?: string | undefined;
                    arguments?: string | undefined;
                }, {
                    name?: string | undefined;
                    arguments?: string | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }, {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        }, {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        }>;
        finish_reason: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        index: number;
        finish_reason: string | null;
        delta: {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        };
    }, {
        index: number;
        finish_reason: string | null;
        delta: {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    object: "chat.completion.chunk";
    model: string;
    id: string;
    created: number;
    choices: {
        index: number;
        finish_reason: string | null;
        delta: {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        };
    }[];
}, {
    object: "chat.completion.chunk";
    model: string;
    id: string;
    created: number;
    choices: {
        index: number;
        finish_reason: string | null;
        delta: {
            role?: string | undefined;
            content?: string | undefined;
            tool_calls?: {
                index: number;
                function?: {
                    name?: string | undefined;
                    arguments?: string | undefined;
                } | undefined;
                type?: "function" | undefined;
                id?: string | undefined;
            }[] | undefined;
        };
    }[];
}>;
type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
declare const PLUGIN_ID: "llm:anthropic";
declare const RESOURCE_TYPE: "llm";
declare const PROVIDER: "anthropic";
declare const VERSION = "1.0.0";
/** Default allowed models */
declare const DEFAULT_ANTHROPIC_MODELS: readonly ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"];
/** Supported actions */
declare const ACTIONS: readonly ["chat.completions"];
type AnthropicAction = (typeof ACTIONS)[number];
/** Enforcement knobs */
declare const ENFORCEMENT_SUPPORT: readonly ["model", "max_tokens", "streaming"];

export { ACTIONS, type AnthropicAction, type ChatCompletionChoice, ChatCompletionChoiceSchema, type ChatCompletionChunk, ChatCompletionChunkSchema, type ChatCompletionRequest, ChatCompletionRequestSchema, type ChatCompletionResponse, ChatCompletionResponseSchema, type ChatMessage, ChatMessageSchema, DEFAULT_ANTHROPIC_MODELS, ENFORCEMENT_SUPPORT, PLUGIN_ID, PROVIDER, RESOURCE_TYPE, type Usage, UsageSchema, VERSION };
