import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { User } from "../users/entities/user.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    telegramId: number,
  ): Promise<{ accessToken: string; role: string }> {
    let user = await this.userRepository.findOne({ where: { telegramId } });

    if (!user) {
      user = this.userRepository.create({ telegramId, role: "user" });
      user = await this.userRepository.save(user);
    }

    const payload = {
      userId: user.id,
      role: user.role,
      telegramId: user.telegramId,
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken, role: user.role };
  }
}
