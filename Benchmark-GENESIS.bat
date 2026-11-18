@echo off
rem ==========================================================================
rem  GENESIS - Benchmark (double-click): measures the simulation on this PC.
rem  Same steps as Lancer-GENESIS.bat (portable Node.js if needed, npm ci),
rem  then builds and runs the benchmark, which writes a dated report
rem  (text + JSON) in rapports\. The window stays open at the end.
rem ==========================================================================
call "%~dp0Lancer-GENESIS.bat" --benchmark
