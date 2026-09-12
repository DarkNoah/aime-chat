import { randomUUID } from 'crypto';
import path from 'path';

/** Complete the shared Model Studio OSS multipart upload using a model-bound policy. */
export async function uploadToAlibabaOss(
  policy: Record<string, any>,
  {
    data,
    fileName,
    mimeType,
    abortSignal,
  }: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
    abortSignal?: AbortSignal;
  },
): Promise<string> {
  const fields = [
    'upload_dir',
    'upload_host',
    'oss_access_key_id',
    'signature',
    'policy',
    'x_oss_object_acl',
    'x_oss_forbid_overwrite',
  ];
  if (
    !policy ||
    fields.some((key) => typeof policy[key] !== 'string' || !policy[key])
  )
    throw new Error('Alibaba upload policy is incomplete');
  const uploadHost = new URL(policy.upload_host);
  if (
    uploadHost.protocol !== 'https:' ||
    uploadHost.username ||
    uploadHost.password
  )
    throw new Error('Invalid Alibaba upload host');
  const maxFileSize = Number(policy.max_file_size_mb);
  if (
    !Number.isFinite(maxFileSize) ||
    maxFileSize <= 0 ||
    data.byteLength > maxFileSize * 1024 * 1024
  )
    throw new Error('File exceeds the Alibaba upload policy size limit');
  const uploadName = `${randomUUID()}-${path.basename(fileName)}`;
  const key = `${policy.upload_dir.replace(/\/+$/, '')}/${uploadName}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', policy.oss_access_key_id);
  form.append('Signature', policy.signature);
  form.append('policy', policy.policy);
  form.append('x-oss-object-acl', policy.x_oss_object_acl);
  form.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('x-oss-content-type', mimeType);
  // OSS requires the file to be the last multipart field.
  form.append(
    'file',
    new Blob([Uint8Array.from(data)], { type: mimeType }),
    uploadName,
  );
  abortSignal?.throwIfAborted();
  const uploaded = await fetch(uploadHost.toString(), {
    method: 'POST',
    body: form,
    redirect: 'error',
    signal: abortSignal
      ? AbortSignal.any([abortSignal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });
  if (!uploaded.ok)
    throw new Error(
      `Alibaba temporary file upload failed (HTTP ${uploaded.status})`,
    );
  abortSignal?.throwIfAborted();
  return `oss://${key}`;
}
