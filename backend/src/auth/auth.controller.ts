import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser, type AuthUser } from './current-user.decorator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  current_password!: string;

  @IsString()
  @MinLength(6)
  new_password!: string;
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}

  /** The only public route in the API — everything else needs a token. */
  @Public()
  @Post('login')
  login(@Body() d: LoginDto) {
    return this.s.login(d.email, d.password);
  }

  /** Who am I — used by the SPA to restore the session and build the profile page. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.s.me(user.sub, user.exp);
  }

  /** Any signed-in account may rotate its own password (admins included). */
  @Patch('me')
  changePassword(@CurrentUser('sub') id: string, @Body() d: ChangePasswordDto) {
    return this.s.changePassword(id, d.current_password, d.new_password);
  }
}
