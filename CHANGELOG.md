# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `pr-address` planning helpers now resolve pipeline-produced inputs only from payload-session artifacts; removed composed JSON stdin/file/reference options fail as usage errors or session-only invalid requests.

<!-- As of: 37e5d0a9b -->
