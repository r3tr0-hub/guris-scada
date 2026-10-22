# SQLite

Unmodified SQLite amalgamation 3.54.1, obtained from the official SQLite download page. Exact source URL and verified SHA3-256 are in SOURCE.json. sqlite3.c and sqlite3.h retain their original public-domain notices. SQLite is compiled into the executable with SQLITE_OMIT_LOAD_EXTENSION, SQLITE_DQS=0 and SQLITE_DEFAULT_MEMSTATUS=0. Upstream Windows unused-parameter warnings are disabled only for its object; application sources retain -Wall -Wextra.
