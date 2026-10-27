// Strict detached-data transport. The native serializer preserves promoted
// binary32 values/sign-zero and exact UTF-8/control bytes without allocating
// an interpreted GSE context for each scalar. Wrappers/functions/undefined,
// invalid UTF-8, nonfinite floats and cycles are explicit errors.
return (value) => { return #json_text_exact(value); };
