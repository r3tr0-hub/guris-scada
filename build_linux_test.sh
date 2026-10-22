#!/bin/sh
set -eu
cd "$(dirname "$0")"
scada_test_build="$(mktemp -d)"
trap 'rm -rf "$scada_test_build"' EXIT
cc -std=c11 -O1 -Wall -Wextra -Wno-unused-parameter -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DQS=0 -DSQLITE_DEFAULT_MEMSTATUS=0 -c vendor/sqlite/sqlite3.c -o "$scada_test_build/sqlite.o"
cc -std=c11 -O1 -g -Wall -Wextra -Wpedantic src/main.c "$scada_test_build/sqlite.o" -o scada-test-host -pthread -lm -lcrypto
python3 -m unittest discover -s tests -p 'test_*.py' -v
for scada_case in test_cleaning_clock test_unwinder_clock test_ui_launch_config test_bootstrap test_production_clock test_production_reasons test_production_shift; do
 cc -std=c11 -O1 -Wall -Wextra -Wpedantic -Wno-unused-function "tests/$scada_case.c" "$scada_test_build/sqlite.o" -o "$scada_test_build/$scada_case" -pthread -lm -lcrypto
 case "$scada_case" in
  test_production_clock|test_production_reasons)
   mkdir "$scada_test_build/$scada_case-data"
   "$scada_test_build/$scada_case" "$scada_test_build/$scada_case-data"
   ;;
  *) "$scada_test_build/$scada_case" ;;
 esac
done
