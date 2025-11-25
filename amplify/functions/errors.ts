// amplify/functions/errors.ts
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly context?: Record<string, any>;

    constructor(message: string, statusCode: number, isOperational = false, context?: Record<string, any>) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.context = context;
        this.name = 'AppError';
        // Ensure the prototype is correctly set
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
