import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';
import { CounterService } from './apps/counter/service';
import type { BroadcastPublisher } from './platform/realtime/service';

export function createServices(db: AppDatabase, broadcast: BroadcastPublisher) {
    const users = new UserService(db);
    const counter = new CounterService(db, broadcast);

    return { users, counter };
}