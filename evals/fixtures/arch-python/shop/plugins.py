class AbstractExporterFactory:
    def create(self):
        raise NotImplementedError


class ExporterFactoryImpl(AbstractExporterFactory):
    def create(self):
        return CsvExporter()


class ExporterRegistry:
    _factories = {"csv": ExporterFactoryImpl()}

    @classmethod
    def get(cls, name):
        return cls._factories[name].create()


class CsvExporter:
    def export(self, rows):
        return "\n".join(",".join(map(str, r)) for r in rows)
