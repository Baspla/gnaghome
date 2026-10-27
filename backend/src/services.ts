import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';

export function createServices(db: AppDatabase) {
    const users = new UserService(db);

    return { users };
}