type DayjsLike = {
  isBefore: () => boolean;
  isSame: () => boolean;
  diff: () => number;
  format: (fmt?: string) => string;
};

function createDayjs(value?: unknown): DayjsLike {
  return {
    isBefore: () => false,
    isSame: () => true,
    diff: () => 0,
    format: () => String(value ?? ''),
  };
}

export default function dayjs(value?: unknown): DayjsLike {
  return createDayjs(value);
}

