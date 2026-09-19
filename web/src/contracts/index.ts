export type Revision = number;

export type CommandSuccess<T> = {
  ok: true;
  data: T;
  roomRevision?: Revision;
  privateRevision?: Revision;
};

export type CommandFailure = {
  ok: false;
  error: {
    code: string;
    messageKey: string;
  };
};

export type CommandResult<T> = CommandSuccess<T> | CommandFailure;
