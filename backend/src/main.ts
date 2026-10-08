import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
async function bootstrap(){const app=await NestFactory.create(AppModule);app.setGlobalPrefix('api');app.enableCors();app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));const config=new DocumentBuilder().setTitle('League Ranking System').setDescription('Sports league management REST API').setVersion('1.0').addBearerAuth().build();SwaggerModule.setup('api/docs',app,SwaggerModule.createDocument(app,config));await app.listen(process.env.PORT||3000);}
bootstrap();
