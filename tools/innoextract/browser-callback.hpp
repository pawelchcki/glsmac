#pragma once

// GLSMAC browser adaptation of innoextract: completed files leave MEMFS before
// extraction continues, while the unmodified parser verifies installer data.
extern "C" int glsmac_store_output_file( const char* filename );
