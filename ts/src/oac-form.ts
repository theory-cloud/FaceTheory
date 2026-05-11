export const AWS_OAC_CONTENT_SHA256_HEADER = 'x-amz-content-sha256';
export const AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE =
  'application/x-www-form-urlencoded;charset=UTF-8';

export type AwsOacFormField = readonly [name: string, value: string];
export type AwsOacSha256Digest = (
  body: Uint8Array,
) => Promise<ArrayBuffer | ArrayBufferView>;

export interface AwsOacUrlEncodedFormBody {
  body: Uint8Array;
  bodyText: string;
  contentType: typeof AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE;
  fields: AwsOacFormField[];
}

export interface AwsOacUrlEncodedFormPayload extends AwsOacUrlEncodedFormBody {
  sha256Hex: string;
}

export interface CollectAwsOacFormFieldsOptions {
  submitter?: HTMLElement | null;
}

export interface CreateAwsOacUrlEncodedFormPayloadOptions
  extends CollectAwsOacFormFieldsOptions {
  digest?: AwsOacSha256Digest;
}

type FormDataConstructor = {
  new (form?: HTMLFormElement, submitter?: HTMLElement | null): FormData;
};

export function collectAwsOacFormFields(
  form: HTMLFormElement,
  options: CollectAwsOacFormFieldsOptions = {},
): AwsOacFormField[] {
  const formData = createFormData(form, options.submitter ?? null);
  const fields: AwsOacFormField[] = [];

  for (const [name, value] of formData.entries()) {
    if (typeof value !== 'string') {
      throw new TypeError(
        `FaceTheory OAC form transport only supports string application/x-www-form-urlencoded fields; received non-string value for ${JSON.stringify(
          name,
        )}`,
      );
    }
    fields.push([name, value]);
  }

  return fields;
}

export function createAwsOacUrlEncodedFormBody(
  fields: Iterable<AwsOacFormField>,
): AwsOacUrlEncodedFormBody {
  const normalizedFields = Array.from(fields, ([name, value]) => [name, value] as AwsOacFormField);
  const params = new URLSearchParams();
  for (const [name, value] of normalizedFields) {
    params.append(name, value);
  }
  const bodyText = params.toString();
  const body = new TextEncoder().encode(bodyText);

  return {
    body,
    bodyText,
    contentType: AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE,
    fields: normalizedFields,
  };
}

export async function createAwsOacUrlEncodedFormPayload(
  form: HTMLFormElement,
  options: CreateAwsOacUrlEncodedFormPayloadOptions = {},
): Promise<AwsOacUrlEncodedFormPayload> {
  const fields = collectAwsOacFormFields(form, options);
  const encoded = createAwsOacUrlEncodedFormBody(fields);
  const sha256Hex = await sha256HexForAwsOacPayload(encoded.body, options.digest);

  return {
    ...encoded,
    sha256Hex,
  };
}

export async function sha256HexForAwsOacPayload(
  body: Uint8Array,
  digest: AwsOacSha256Digest = subtleSha256Digest,
): Promise<string> {
  return bytesToHex(toUint8Array(await digest(body)));
}

function createFormData(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): FormData {
  const view = form.ownerDocument.defaultView as
    | (Window & { FormData?: FormDataConstructor })
    | null;
  const FormDataCtor: FormDataConstructor | undefined = view?.FormData ?? globalThis.FormData;

  if (typeof FormDataCtor !== 'function') {
    throw new Error('FaceTheory OAC form helpers require FormData in the current environment');
  }

  if (submitter) {
    return new FormDataCtor(form, submitter);
  }

  return new FormDataCtor(form);
}

async function subtleSha256Digest(body: Uint8Array): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('FaceTheory OAC form hashing requires crypto.subtle in the current environment');
  }

  return subtle.digest('SHA-256', copyArrayBuffer(body));
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toUint8Array(bytes: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
