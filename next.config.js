const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isUserOrOrganizationPage = repositoryName?.endsWith(".github.io");

module.exports = {
	output: "export",
	trailingSlash: true,
	...(process.env.GITHUB_ACTIONS === "true" && repositoryName && !isUserOrOrganizationPage
		? { basePath: `/${repositoryName}` }
		: {}),
};
