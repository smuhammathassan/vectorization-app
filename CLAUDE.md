# Claude Development Rules

## Core Principle
**When adding new functionality or fixing issues, ensure previously working functionality continues to work.**

## Development Guidelines

### 1. Backward Compatibility
- Always test existing features after making changes
- Run backend health checks after modifications
- Verify frontend can still connect to backend APIs

### 2. File System Imports (TypeScript/Node.js)
Use consistent import patterns for fs modules:

**Recommended Pattern:**
```typescript
import fs from 'fs';
// Then use: fs.promises.mkdir(), fs.promises.readFile(), etc.
```

**Alternative Pattern:**
```typescript
import { promises as fs } from 'fs';
// Then use: fs.mkdir(), fs.readFile(), etc.
```

**❌ Avoid:**
```typescript
import { promises as fs } from 'fs';
// Then using: fs.promises.mkdir() - This creates a conflict!
```

### 3. Testing Requirements
After any changes to backend converters:
1. Start backend with `./start-debug.sh` or `npm run dev`
2. Test API endpoints:
   - `/api/health` should return 200
   - `/api/methods` should list available converters
   - `/api/upload` should accept file uploads
3. Verify frontend can load and connect to backend

### 4. Error Handling
- Always check for TypeScript compilation errors
- Test converter availability with proper error handling
- Ensure temporary file cleanup in converters

### 5. Import Consistency
- Use absolute paths for imports where possible
- Follow existing patterns in each file
- Ensure proper TypeScript types are imported

## Commands to Run After Changes
```bash
# Test backend
cd backend && npm run dev

# Test frontend 
cd frontend && npm run dev

# Full debug mode
./start-debug.sh
```