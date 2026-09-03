import type { Repository } from 'typeorm';

import type { UserEntity } from './user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('uses the injected repository for persistence queries', async () => {
    const user = { id: '9fbe8506-a58f-40fd-b2af-5aca1ed3f506' } as UserEntity;
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(user),
    };
    const service = new UsersService(repository as unknown as Repository<UserEntity>);

    await expect(service.findById(user.id)).resolves.toBe(user);
    expect(repository.findOneBy).toHaveBeenCalledWith({ id: user.id });
  });
});
