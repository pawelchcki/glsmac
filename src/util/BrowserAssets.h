#pragma once

#include <string>

namespace util {
namespace BrowserAssets {

// Materialize a managed browser asset before the synchronous filesystem read.
// Other paths, desktop builds and pages without an asset store are unchanged.
void EnsureFile( const std::string& absolute_path );

}
}
