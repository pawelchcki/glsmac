#!/usr/bin/env python3
"""Keep the required Hot tests check failing when its engine producer fails."""

import os
import sys


def main():
    result = os.environ.get('TEST_ENGINE_RESULT', '')
    shared = os.environ.get('TEST_ENGINE_ARTIFACT', '')
    # Main supplies an artifact from its own successful, required engine job.
    # PRs build their engine locally; an absent result is never a success.
    if result == 'success' or result == 'skipped' and shared:
        return 0
    print('Test engine producer did not succeed: ' + repr(result), file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
