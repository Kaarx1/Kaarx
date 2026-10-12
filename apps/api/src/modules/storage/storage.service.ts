import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';

const PUT_URL_TTL_SEC = 600;
const GET_URL_TTL_SEC = 3600;

@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    },
    // Keep checksum query params out of presigned URLs; Supabase and phone uploads don't send them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  presignPut(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: PUT_URL_TTL_SEC });
  }

  presignGet(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: GET_URL_TTL_SEC });
  }
}
