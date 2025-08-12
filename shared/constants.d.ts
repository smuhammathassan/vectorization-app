export declare const SUPPORTED_INPUT_FORMATS: readonly ["image/png", "image/jpeg", "image/jpg", "image/bmp", "image/tiff", "image/webp"];
export declare const SUPPORTED_OUTPUT_FORMATS: readonly ["svg", "pdf", "eps", "ai"];
export declare const MAX_FILE_SIZE: number;
export declare const MAX_FILES_PER_BATCH = 10;
export declare const CONVERSION_METHODS: {
    readonly VTRACER: "vtracer";
    readonly OPENCV: "opencv";
    readonly POTRACE: "potrace";
    readonly AUTOTRACE: "autotrace";
    readonly INKSCAPE: "inkscape";
    readonly SKIMAGE: "skimage";
};
export declare const JOB_STATUS: {
    readonly PENDING: "pending";
    readonly QUEUED: "queued";
    readonly PROCESSING: "processing";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly CANCELLED: "cancelled";
};
export declare const API_ENDPOINTS: {
    readonly UPLOAD: "/api/upload";
    readonly FILES: "/api/files";
    readonly CONVERT: "/api/convert";
    readonly BATCH_CONVERT: "/api/convert/batch";
    readonly METHODS: "/api/methods";
    readonly HEALTH: "/api/health";
};
export declare const ERROR_CODES: {
    readonly FILE_TOO_LARGE: "FILE_TOO_LARGE";
    readonly INVALID_FORMAT: "INVALID_FORMAT";
    readonly FILE_NOT_FOUND: "FILE_NOT_FOUND";
    readonly CONVERSION_FAILED: "CONVERSION_FAILED";
    readonly METHOD_NOT_AVAILABLE: "METHOD_NOT_AVAILABLE";
    readonly INVALID_PARAMETERS: "INVALID_PARAMETERS";
    readonly SYSTEM_ERROR: "SYSTEM_ERROR";
    readonly DEPENDENCY_MISSING: "DEPENDENCY_MISSING";
};
//# sourceMappingURL=constants.d.ts.map