import { IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: "username: use apenas letras, números, _ . -",
  })
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
